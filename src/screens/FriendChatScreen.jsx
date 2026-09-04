import React, { useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
  ActivityIndicator,
  LayoutAnimation,
  ImageBackground,
  ScrollView} from 'react-native';
import {
  useAudioPlayer,
  useAudioRecorder,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { deleteAsync } from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { radius, chatFonts } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { sendMessageNotification } from '../utils/notifications';
import { resolveFriendshipForChat } from '../services/sparks';
import { pickChatMediaAsset, uploadChatMediaAsset } from '../supabase/storage';
import { getPlaceholderUrl } from '../utils/placeholders';
import { setChatPreview } from '../utils/chatPreviewStore';
import AttachmentSheet from '../components/AttachmentSheet';
import GiphyPicker from '../components/GiphyPicker';
import { GIPHY_CONTENT_TYPES, trackGiphyAction } from '../services/giphy';

const { width: W } = Dimensions.get('window');

// Replaces the old `<Video>` component from expo-av. expo-video's API is
// hook-based: you create a player with useVideoPlayer(source), then hand
// the player to <VideoView>. `autoplay` mirrors the old `shouldPlay`
// prop. nativeControls + resizeMode behave the same as the old
// `useNativeControls` / `resizeMode` props. The hook handles cleanup
// when the component unmounts.
function ChatVideo({ uri, style, resizeMode = 'contain', autoplay = false, nativeControls = true }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={nativeControls}
      contentFit={resizeMode}
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

async function enrichPostShareMessages(messages) {
  const postIds = [...new Set(
    messages.filter((m) => m.type === 'post_share' && m.post_id).map((m) => m.post_id),
  )];
  if (postIds.length === 0) return messages;

  const { data: posts } = await supabase
    .from('posts')
    .select('id, caption, image_url, post_type, user_id')
    .in('id', postIds);

  const postsMap = new Map((posts ?? []).map((p) => [p.id, p]));
  const userIds = [...new Set((posts ?? []).map((p) => p.user_id).filter(Boolean))];

  let usersMap = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, photo_urls')
      .in('id', userIds);
    usersMap = new Map((users ?? []).map((u) => [u.id, u]));
  }

  return messages.map((m) => {
    if (m.type !== 'post_share' || !m.post_id) return m;
    const post = postsMap.get(m.post_id);
    if (!post) return m;
    return {
      ...m,
      shared_post: {
        ...post,
        author: usersMap.get(post.user_id) ?? null,
      },
    };
  });
}

const REPORT_REASONS = [
  'Fake profile', 'Harassment', 'Underage user', 'Scam or fraud',
  'Sexual content', 'Hate speech', 'Impersonation', 'Spam', 'Other',
];

// Fallback shape for legacy voice notes recorded before real waveforms were captured.
const FALLBACK_WAVE = [3, 5, 8, 12, 10, 6, 4, 7, 11, 15, 13, 9, 5, 8, 10, 14, 12, 8, 6, 4, 3, 5, 7, 10, 8, 5, 3];
// Number of bars shown in the live recording meter.
const LIVE_BARS = 30;

// Map a stored 0–100 amplitude to a bar height in px (min 3, max ~18).
function ampToHeight(v) {
  return 3 + (Math.max(0, Math.min(100, v)) / 100) * 15;
}

// Downsample raw 0–1 metering samples into `buckets` peak values (0–100) for storage.
// Always returns an array (never null) so the real captured waveform is persisted.
// Quiet recordings will have low values but still show the actual speech pattern.
function buildWaveform(peaks, buckets = 40) {
  if (!peaks || peaks.length === 0) return null;
  const out = [];
  if (peaks.length <= buckets) {
    for (let i = 0; i < peaks.length; i++) out.push(Math.round(peaks[i] * 100));
  } else {
    const size = peaks.length / buckets;
    for (let i = 0; i < buckets; i++) {
      const start = Math.floor(i * size);
      const end = Math.floor((i + 1) * size);
      let max = 0;
      for (let j = start; j < end; j++) if (peaks[j] > max) max = peaks[j];
      out.push(Math.round(max * 100));
    }
  }
  // Return the array even if all values are low — it's the real recorded data.
  // The UI will render it (quiet bars are better than a fake fallback).
  return out;
}

// Playback audio session — allowsRecording:false is what routes sound to the
// LOUD main speaker instead of the quiet earpiece. Must be set after any
// recording, or sent voice notes play back barely audibly on iOS.
async function setPlaybackAudioMode() {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      shouldPlayInBackground: false,
    });
  } catch (e) {}
}

function AudioWaveform({ progress, isMe, colors, onSeek, waveform }) {
  const bars = (Array.isArray(waveform) && waveform.length > 0)
    ? waveform.map(ampToHeight)
    : FALLBACK_WAVE;
  const [layoutWidth, setLayoutWidth] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => handleSeek(evt),
      onPanResponderMove: (evt) => handleSeek(evt),
    })
  ).current;

  const handleSeek = (evt) => {
    if (layoutWidth === 0) return;
    let newProgress = evt.nativeEvent.locationX / layoutWidth;
    if (newProgress < 0) newProgress = 0;
    if (newProgress > 1) newProgress = 1;
    if (onSeek) onSeek(newProgress);
  };
  
  return (
    <View 
      style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, height: 30 }}
      onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      {bars.map((h, i) => {
        const barProgress = i / bars.length;
        const isActive = barProgress <= progress;
        return (
          <View
            key={i}
            style={{
              width: 2.5,
              height: Math.max(2, h),
              backgroundColor: isActive 
                ? (isMe ? colors.white : colors.ink) 
                : (isMe ? 'rgba(255,255,255,0.4)' : colors.fog),
              marginHorizontal: 1,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

function AudioBubble({ uri, s, colors, isMe, waveform }) {
  // useAudioPlayer replaces the old `Audio.Sound.createAsync` +
  // manual onStatus subscription. The hook loads the clip
  // automatically and exposes .play()/.pause()/.seekTo() plus a
  // playbackStatusUpdate event we subscribe to for progress. The
  // hook also handles release() on unmount, so we don't need the
  // isMounted ref dance.
  const player = useAudioPlayer({ uri });

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      const dur = status.duration ?? 0;       // seconds
      const pos = status.currentTime ?? 0;   // seconds
      if (dur > 0) {
        setDuration(Math.round(dur * 1000));
        setProgress(pos / dur);
      }
      setIsPlaying(status.playing);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setProgress(0);
      }
    });
    return () => sub.remove();
  }, [player]);

  const togglePlayback = async () => {
    if (!player) return; // still loading
    if (isPlaying) {
      player.pause();
    } else {
      // Ensure the loud main speaker is active (a prior recording may have left
      // the session routed to the earpiece).
      await setPlaybackAudioMode();
      if (progress >= 0.98) {
        player.seekTo(0);
        setProgress(0);
      }
      player.play();
    }
  };

  const formatSecs = (millis) => {
    const s = Math.floor(millis / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
      <TouchableOpacity onPress={togglePlayback} style={{ padding: 4 }}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={26} color={isMe ? colors.white : colors.ink} />
      </TouchableOpacity>
      
      <AudioWaveform
        progress={progress}
        isMe={isMe}
        colors={colors}
        waveform={waveform}
        onSeek={async (p) => {
          if (player && duration > 0) {
            setProgress(p);
            player.seekTo((p * duration) / 1000); // player.seekTo takes seconds
            if (!isPlaying) {
              player.play();
              setIsPlaying(true);
            }
          }
        }}
      />
      
      {duration > 0 && (
        <Text style={{ fontSize: 11, color: isMe ? colors.snow : colors.ash, marginLeft: 4 }}>
          {formatSecs((isPlaying || progress > 0) ? progress * duration : duration)}
        </Text>
      )}
    </View>
  );
}

// Pre-send preview player — lets you listen back, scrub, see the waveform and
// duration, and delete the take before committing to send. Reuses the same
// load/play/seek logic as AudioBubble but styled for the input bar.
function AudioPreviewPlayer({ uri, colors, waveform, onDelete }) {
  // Same pattern as AudioBubble: useAudioPlayer replaces the old
  // Audio.Sound.createAsync + onStatus dance.
  const player = useAudioPlayer({ uri });

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      const dur = status.duration ?? 0;
      const pos = status.currentTime ?? 0;
      if (dur > 0) {
        setDuration(Math.round(dur * 1000));
        setProgress(pos / dur);
      }
      setIsPlaying(status.playing);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setProgress(0);
      }
    });
    return () => sub.remove();
  }, [player]);

  const togglePlayback = async () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      // A take was just recorded — make sure we're back on the loud speaker.
      await setPlaybackAudioMode();
      if (progress >= 0.98) {
        player.seekTo(0);
        setProgress(0);
      }
      player.play();
    }
  };

  const formatSecs = (millis) => {
    const secs = Math.floor(millis / 1000);
    const m = Math.floor(secs / 60);
    return `${m}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.snow,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.fog,
      paddingHorizontal: 6,
      paddingVertical: 4,
    }}>
      <TouchableOpacity onPress={togglePlayback} style={{ padding: 6 }}>
        <Ionicons name={isPlaying ? 'pause-circle' : 'play-circle'} size={34} color={colors.ember} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <AudioWaveform
          progress={progress}
          isMe={false}
          colors={colors}
          waveform={waveform}
          onSeek={async (p) => {
            if (player && duration > 0) {
              setProgress(p);
              player.seekTo((p * duration) / 1000); // player.seekTo takes seconds
              if (!isPlaying) {
                player.play();
                setIsPlaying(true);
              }
            }
          }}
        />
      </View>

      <Text style={{ fontSize: 12, color: colors.ash, marginLeft: 4, minWidth: 34, textAlign: 'center' }}>
        {formatSecs((isPlaying || progress > 0) ? progress * duration : duration)}
      </Text>

      <TouchableOpacity onPress={onDelete} style={{ padding: 6, marginLeft: 2 }}>
        <Ionicons name="trash-outline" size={20} color={colors.ash} />
      </TouchableOpacity>
    </View>
  );
}

function LiveAudioWaveform({ colors, levels }) {
  // Right-align the most recent samples; pad the left with silence so the meter
  // scrolls in from the right as you speak.
  const data = Array(LIVE_BARS).fill(0);
  if (Array.isArray(levels) && levels.length) {
    const recent = levels.slice(-LIVE_BARS);
    for (let i = 0; i < recent.length; i++) {
      data[LIVE_BARS - recent.length + i] = recent[i];
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, height: 24 }}>
      {data.map((lvl, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: 3 + Math.max(0, Math.min(1, lvl)) * 18,
            backgroundColor: colors.ember,
            marginHorizontal: 1.5,
            borderRadius: 2,
            opacity: lvl > 0 ? 1 : 0.35,
          }}
        />
      ))}
    </View>
  );
}

const MAX_PENDING_MSGS = 3;

function formatTime(iso) {
  if (!iso) return '';

  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function MessageTicks({ item, isMe, colors }) {
  const tickColor = isMe ? 'rgba(255, 255, 255, 0.9)' : colors.ember;
  const sentColor = isMe ? 'rgba(255, 255, 255, 0.6)' : colors.ash;

  if (item.status === 'failed') {
    return <Ionicons name="alert-circle" size={14} color={isMe ? '#ffdddd' : colors.ember} />;
  }

  if (item.isTemp || item.status === 'sending') {
    return <Ionicons name="checkmark" size={14} color={sentColor} />;
  }

  if (item.is_read === true) {
    return <Ionicons name="checkmark-done" size={14} color={tickColor} />;
  }

  return <Ionicons name="checkmark-done" size={14} color={sentColor} />;
}

function Bubble({ item, messages, myId, onPressMedia, onLongPressMessage, onReply, onScrollToMessage, s, colors, isHighlighted, chatFont }) {
  const isMe = item.sender_id === myId;
  const pan = useRef(new Animated.ValueXY()).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);

  // Flash animation when this message is highlighted (reply-tap scroll target)
  useEffect(() => {
    if (isHighlighted) {
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0.3, duration: 300, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0.8, duration: 200, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      ]).start();
    }
  }, [isHighlighted]);

  const highlightBorderColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', colors.ember],
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0) {
          // Damped drag — resistance increases as you swipe further
          const damped = Math.min(80, gestureState.dx * 0.6);
          pan.setValue({ x: damped, y: 0 });

          // Haptic at threshold
          if (damped > 35 && !hasTriggered.current) {
            hasTriggered.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const damped = Math.min(80, gestureState.dx * 0.6);
        if (damped > 35) {
          onReply(item);
        }
        hasTriggered.current = false;
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          tension: 80,
          friction: 10,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderTerminateRequest: () => false,
      onPanResponderTerminate: () => {
        hasTriggered.current = false;
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          tension: 80,
          friction: 10,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Reply arrow opacity — fades in as user swipes
  const replyArrowOpacity = pan.x.interpolate({
    inputRange: [0, 20, 40],
    outputRange: [0, 0.3, 1],
    extrapolate: 'clamp',
  });

  const bubbleStyle = {
    transform: [{ translateX: pan.x }],
  };

  const replyMsg = messages?.find((m) => m.id === item.reply_to_id);

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPressMessage(item);
  };

  const renderReplySnippet = () => {
    if (!replyMsg) return null;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onScrollToMessage && onScrollToMessage(replyMsg.id)}
        style={{
          backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : colors.emberLight,
          padding: 8,
          borderRadius: 10,
          marginBottom: 6,
          borderLeftWidth: 4,
          borderLeftColor: colors.ember,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: isMe ? 'rgba(255,255,255,0.9)' : colors.ember, marginBottom: 2 }}>
          {replyMsg.sender_id === myId ? 'You' : 'Friend'}
        </Text>
        <Text style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.7)' : colors.ash }} numberOfLines={3}>
          {replyMsg.text || (replyMsg.type === 'audio' ? 'Voice note' : (replyMsg.type === 'image' ? 'Image' : 'Media'))}
        </Text>
      </TouchableOpacity>
    );
  };

  // Inline meta (timestamp + ticks) — rendered INSIDE each bubble
  const renderMeta = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
      {item.edited_at && (
        <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.5)' : colors.ash, fontStyle: 'italic' }}>edited</Text>
      )}
      <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.5)' : colors.ash }}>{formatTime(item.created_at)}</Text>
      {isMe && <MessageTicks item={item} isMe={isMe} colors={colors} />}
    </View>
  );

  const fontFamily = chatFont
    ? (Platform.OS === 'ios' ? chatFont.ios : chatFont.android)
    : (Platform.OS === 'ios' ? 'Georgia' : 'serif');

  let inner = null;

  const isAudioMsg = item.type === 'audio' || (item.media_url && (item.media_url.includes('.m4a') || item.media_url.includes('.mp3') || item.media_url.includes('.wav') || item.media_url.includes('.aac')));
  const isGiphyMsg = item.type === GIPHY_CONTENT_TYPES.GIF || item.type === GIPHY_CONTENT_TYPES.STICKER;

  if (item.type === 'date_header') {
    return (
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
          <Text style={{ fontSize: 12, color: colors.ash, fontWeight: '600' }}>{item.dateStr}</Text>
        </View>
      </View>
    );
  }

  if (item.deleted_for_everyone) {
    inner = (
      <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
        <Text style={[s.bubbleText, { fontStyle: 'italic', color: colors.ash, fontFamily }]}>
          This message was deleted.
        </Text>
        {renderMeta()}
      </View>
    );
  } else if (item.type === 'image' || item.type === 'video' || (item.media_url && !isAudioMsg)) {
    const isVideo = item.media_url?.includes('.mp4') || item.media_url?.includes('.mov');
    inner = (
        <TouchableOpacity
          style={[s.bubble, s.mediaBubble, isGiphyMsg ? s.giphyBubble : (isMe ? s.bubbleMe : s.bubbleThem)]}
          onPress={() => onPressMedia(item.media_url, isVideo, isGiphyMsg)}
          onLongPress={handleLongPress}
          activeOpacity={0.8}
        >
          {renderReplySnippet()}
          {isVideo ? (
            <ChatVideo
              uri={item.media_url}
              style={s.mediaContent}
              contentFit="contain"
              autoplay={false}
            />
          ) : isGiphyMsg ? (
            <ExpoImage
              source={{ uri: item.media_url }}
              style={s.giphyMediaContent}
              contentFit="contain"
              cachePolicy="none"
              accessibilityLabel={item.type === GIPHY_CONTENT_TYPES.STICKER ? 'GIPHY sticker' : 'GIPHY GIF'}
            />
          ) : (
            <ExpoImagesource={{ uri: item.media_url }} style={s.mediaContent} contentFit="contain" />
          )}
          {item.text ? <Text style={[s.bubbleText, isMe && s.bubbleTextMe, { marginTop: 6, fontFamily }]}>{item.text}</Text> : null}
          {renderMeta()}
        </TouchableOpacity>
    );
  } else if (item.type === 'post_share') {
    const shared = item.shared_post;
    inner = (
        <View style={[s.bubbleShare, isMe ? s.bubbleMe : s.bubbleThem]}>
          {renderReplySnippet()}
          <View style={s.shareHeader}>
            <Ionicons
              name="share-social"
              size={16}
              color={isMe ? colors.white : colors.ember}
            />
            <Text style={[s.shareHeaderText, isMe && s.shareHeaderTextMe]}>
              Shared a post
            </Text>
          </View>

          {shared ? (
            <View style={s.sharePostCard}>
              <View style={s.sharePostAuthorRow}>
                <View style={s.sharePostAvatar}>
                  {shared.author?.photo_urls?.[0] ? (
                    <ExpoImagesource={{ uri: shared.author.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
                  ) : (
                    <ExpoImage
                      source={{ uri: getPlaceholderUrl(shared.author?.name) }}
                      style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
                    />
                  )}
                </View>
                <Text style={[s.sharePostAuthor, isMe && s.bubbleTextMe]} numberOfLines={1}>
                  {shared.author?.name || 'Someone'}
                </Text>
              </View>
              {shared.caption ? (
                <Text style={[s.sharePostCaption, isMe && s.bubbleTextMe, { fontFamily }]} numberOfLines={5}>
                  {shared.caption}
                </Text>
              ) : null}
              {shared.image_url ? (
                <TouchableOpacity
                  onPress={() => onPressMedia(shared.image_url, false)}
                  activeOpacity={0.85}
                >
                  <ExpoImagesource={{ uri: shared.image_url }} style={s.sharePostImage} contentFit="cover" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <Text style={[s.bubbleText, isMe && s.bubbleTextMe, { fontFamily }]}>
              This post is no longer available.
            </Text>
          )}
          {renderMeta()}
        </View>
    );
  } else if (isAudioMsg) {
    inner = (
        <TouchableOpacity 
          style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}
          onLongPress={handleLongPress}
          activeOpacity={0.9}
        >
          {renderReplySnippet()}
          <AudioBubble uri={item.media_url} s={s} colors={colors} isMe={isMe} waveform={item.waveform} />
          {renderMeta()}
        </TouchableOpacity>
    );
  } else {
    inner = (
      <TouchableOpacity 
        style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}
        onLongPress={handleLongPress}
        activeOpacity={0.9}
      >
        {renderReplySnippet()}
        <Text style={[s.bubbleText, isMe && s.bubbleTextMe, { fontFamily }]}>
          {item.text}
        </Text>
        {renderMeta()}
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View style={[s.bubbleRow, isMe && s.bubbleRowMe, bubbleStyle, { borderWidth: 2, borderColor: highlightBorderColor, borderRadius: 22 }]} {...panResponder.panHandlers}>
      {/* Reply arrow icon — fades in during swipe */}
      <Animated.View style={{ position: 'absolute', left: -28, top: '50%', marginTop: -10, opacity: replyArrowOpacity }}>
        <Ionicons name="arrow-undo" size={20} color={colors.ember} />
      </Animated.View>
      {inner}
    </Animated.View>
  );
}

export default function FriendChatScreen({ route, navigation }) {
  const { colors, shadow, isDark, chatFont, activeChatTheme } = useTheme();
  const chatFontObj = chatFonts[chatFont] || chatFonts.system;
  const s = getStyles(colors, shadow, isDark);

  const {
    friendship: initialFriendship,
    otherUser,
    myUid,
  } = route?.params ?? {};

  const msgsTable = 'friend_messages';
  const chatFk = 'friendship_id';

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [friendship, setFriendship] = useState(initialFriendship);
  // Prefer real friendship id — never use a spark row id as friendship_id.
  const looksLikeSpark =
    initialFriendship &&
    (initialFriendship.sender_id != null || initialFriendship.receiver_id != null) &&
    initialFriendship.requester_id == null;
  const [chatId, setChatId] = useState(
    looksLikeSpark ? null : initialFriendship?.id ?? null
  );
  const [sentPendingCount, setSentPendingCount] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState(null);
  const [viewMedia, setViewMedia] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [giphyPickerVisible, setGiphyPickerVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [optionsSheetMode, setOptionsSheetMode] = useState('menu'); // 'menu' | 'report'
  const [friendIsTyping, setFriendIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const channelRef = useRef(null);
  const myTypingRef = useRef(false);
  const stopTypingTimeoutRef = useRef(null);

  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const wantsToStop = useRef(false);
  const isPreparingRecording = useRef(false);
  // The microphone gesture is created once. Keep its send target current so
  // a recording made after the chat ID resolves is sent to that chat.
  const sendRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef(null);
  const recordingSecondsRef = useRef(0);
  const [liveLevels, setLiveLevels] = useState([]); // 0–1 mic levels for the live meter
  const peaksRef = useRef([]);                       // all captured 0–1 peaks for this take
  const hasAudioPermissionRef = useRef(false);       // cached so we don't re-request on every press

  // SDK 57: useAudioRecorder replaces the old Audio.Recording.createAsync
  // pattern. We create the recorder ONCE at component mount; the hook
  // handles the native lifecycle for us and exposes .record()/.stop().
  // RecordingPresets.HIGH_QUALITY does not enable metering by default,
  // so we spread it and set isMeteringEnabled: true so the live meter
  // gets dBFS levels from getStatus().metering.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const meterIntervalRef = useRef(null);

  // Ask for mic permission up-front so the first press-and-hold isn't interrupted
  // by the OS prompt (which would drop the user's first voice note), and set the
  // loud-speaker playback session so incoming notes are audible immediately.
  useEffect(() => {
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        hasAudioPermissionRef.current = perm.granted === true || perm.status === 'granted';
      } catch (e) {}
      setPlaybackAudioMode();
    })();
  }, []);

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      clearInterval(meterIntervalRef.current);
      if (recordingRef.current) {
        const { recorder: r } = recordingRef.current.recorder
          ? recordingRef.current
          : { recorder: recordingRef.current };
        try { r.stop(); } catch (e) {}
      }
    };
  }, []);

  const [micIsLocked, setMicIsLocked] = useState(false);
  const micIsLockedRef = useRef(false);
  const micPan = useRef(new Animated.ValueXY()).current;
  const recPulse = useRef(new Animated.Value(1)).current;

  // Pulse the "recording" dot while a take is in progress.
  useEffect(() => {
    if (!isRecording) {
      recPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recPulse, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(recPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording]);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  const connectedBannerTimer = useRef(null);
  const bannerShownRef = useRef(false);

  // Load persisted "connected banner seen" state for this friend
  useEffect(() => {
    let isMounted = true;
    const loadConnectedBanner = async () => {
      if (!otherUser?.id) return;
      try {
        const seen = await AsyncStorage.getItem(`@cupid_connected_banner_${otherUser.id}`);
        if (isMounted && !seen) {
          setShowConnectedBanner(true);
          bannerShownRef.current = true;
          // Persist immediately so it never shows again for this person
          AsyncStorage.setItem(`@cupid_connected_banner_${otherUser.id}`, '1').catch(() => {});
          connectedBannerTimer.current = setTimeout(() => {
            setShowConnectedBanner(false);
          }, 30000);
        }
      } catch (err) {
        console.error('Failed to load connected banner state:', err);
      }
    };
    loadConnectedBanner();
    return () => {
      isMounted = false;
      if (connectedBannerTimer.current) clearTimeout(connectedBannerTimer.current);
      // If banner was shown but timeout didn't complete, ensure it's persisted
      if (bannerShownRef.current && !isMounted) {
        AsyncStorage.setItem(`@cupid_connected_banner_${otherUser.id}`, '1').catch(() => {});
      }
    };
  }, [otherUser?.id]);


  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;

  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 40;

  const toggleSearch = () => {
    if (isSearchVisible) {
      Animated.timing(searchAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        setIsSearchVisible(false);
        setSearchQuery('');
      });
    } else {
      setIsSearchVisible(true);
      Animated.timing(searchAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  };

  const filteredMessages = searchQuery 
    ? messages.filter((m) => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const processedMessages = React.useMemo(() => {
    if (searchQuery) return filteredMessages;
    
    const result = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgDateStr = new Date(msg.created_at).toDateString();
      result.push(msg);

      const nextMsg = messages[i + 1];
      const nextDateStr = nextMsg ? new Date(nextMsg.created_at).toDateString() : null;

      if (!nextMsg || msgDateStr !== nextDateStr) {
        result.push({
          id: `date-${msgDateStr}`,
          type: 'date_header',
          dateStr: msgDateStr,
        });
      }
    }
    return result;
  }, [messages, searchQuery, filteredMessages]);

  const hasContent = text.trim().length > 0 || !!selectedMedia || micIsLocked;
  const sendBtnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(sendBtnAnim, {
      toValue: hasContent ? 1 : 0,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [hasContent]);

  const listRef = useRef(null);
  // Keep a stable ref to messages so the polling interval can read the
  // latest state without being re-created on every render.
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const iAmRequester = friendship?.requester_id === myUid;
  const isPending = friendship?.status === 'pending';
  const isLimited = iAmRequester && isPending;
  const msgLimitHit = isLimited && sentPendingCount >= MAX_PENDING_MSGS;

  // If we were opened with a spark object (legacy Message button), resolve the real friendship.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const otherId =
        otherUser?.id ||
        initialFriendship?.sender_id ||
        initialFriendship?.receiver_id ||
        (initialFriendship?.requester_id === myUid
          ? initialFriendship?.recipient_id
          : initialFriendship?.requester_id);

      const needsResolve =
        !friendship?.requester_id ||
        !friendship?.recipient_id ||
        looksLikeSpark ||
        (friendship?.status === 'accepted' && !friendship?.id);

      if (!myUid || !otherId || !needsResolve) {
        if (friendship?.id && friendship?.requester_id) {
          setChatId(friendship.id);
        }
        return;
      }

      try {
        const resolved = await resolveFriendshipForChat(myUid, otherId);
        if (cancelled || !resolved) return;
        setFriendship(resolved);
        setChatId(resolved.id);
      } catch (e) {
        console.log('[FriendChat] resolve friendship:', e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myUid, otherUser?.id]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  }, []);

  // Scroll to a specific message (reply-tap) and highlight it
  const scrollToMessage = useCallback((messageId) => {
    const index = processedMessages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1500);
  }, [processedMessages]);

  // Save an edited message
  const saveEdit = useCallback(async (messageId, newText) => {
    const trimmed = newText.trim();
    if (!trimmed || !messageId) return;
    
    // Optimistic update
    setMessages((prev) => prev.map((m) =>
      m.id === messageId ? { ...m, text: trimmed, edited_at: new Date().toISOString() } : m
    ));
    setEditingMessage(null);
    setText('');

    const { error } = await supabase
      .from(msgsTable)
      .update({ text: trimmed, edited_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) {
      Alert.alert('Error', 'Failed to edit message.');
      // Revert
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, text: m.text, edited_at: null } : m
      ));
    }
  }, [msgsTable]);

  const autoAccept = useCallback(async () => {
    if (!friendship?.id || friendship.status === 'accepted') return;
    // Only auto-accept real friendship rows (not spark-shaped objects).
    if (!friendship.requester_id || !friendship.recipient_id) return;

    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendship.id);

    if (!error) {
      setFriendship((prev) => ({ ...prev, status: 'accepted' }));
    }
  }, [friendship]);

  const markIncomingMessagesAsRead = useCallback(
    async (msgs) => {
      if (!myUid || !chatId) return;

      const unreadIds = msgs
        .filter((m) => m.sender_id !== myUid && !m.is_read && !m.isTemp)
        .map((m) => m.id);

      if (unreadIds.length === 0) return;

      const { data, error } = await supabase
        .from(msgsTable)
        .update({ is_read: true })
        .in('id', unreadIds)
        .select('id');

      if (error) {
        console.log('[FriendChatScreen] Error updating read status:', error.message);
      } else if (!data || data.length === 0) {
        console.log('\n⚙️ [CRITICAL RLS ERROR] Tried to mark messages as read, but 0 rows were updated!');
        console.log('This means your Supabase Row Level Security (RLS) policy on the `friend_messages` table is BLOCKING updates.');
        console.log('You need to add an UPDATE policy to `friend_messages` that allows the recipient to update the row.\n');
      }

      if (!error && data && data.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            unreadIds.includes(m.id) ? { ...m, is_read: true } : m
          )
        );
      }
    },
    [myUid, chatId]
  );


  const loadMessages = useCallback(async (isLoadMore = false) => {
    if (!chatId || !myUid) return;
    if (isLoadMore && (!hasMore || loading)) return;

    if (!isLoadMore) {
      setLoading(true);
      setPage(0);
      setHasMore(true);
    }
    
    const currentPage = isLoadMore ? page + 1 : 0;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from(msgsTable)
      .select('*')
      .eq(chatFk, chatId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.log('Load messages error:', error.message);
      if (!isLoadMore) setLoading(false);
      return;
    }

    const loadedMessages = (data ?? []).filter(
      (m) => !m.deleted_by || !m.deleted_by.includes(myUid)
    );
    const enrichedMessages = await enrichPostShareMessages(loadedMessages);

    if (enrichedMessages.length < PAGE_SIZE) {
      setHasMore(false);
    }

    setMessages(prev => {
      if (isLoadMore) {
        return [...prev, ...enrichedMessages]; 
      }
      return enrichedMessages;
    });

    if (!isLoadMore) {
      setSentPendingCount(enrichedMessages.filter((m) => m.sender_id === myUid).length);
      setLoading(false);
      await markIncomingMessagesAsRead(enrichedMessages);
    }

    setPage(currentPage);
  }, [chatId, myUid, msgsTable, hasMore, loading, page]);

  useEffect(() => {
    if (!chatId || !myUid) return;
    loadMessages();

    const channel = supabase
      .channel(`friend-chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: msgsTable, filter: `${chatFk}=eq.${chatId}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
            return;
          }

          const msg = payload.new;

          if (payload.eventType === 'UPDATE') {
            if (msg.deleted_by?.includes(myUid)) {
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
              );
            }
            return;
          }

          // INSERT
          if (msg.deleted_by?.includes(myUid)) return;

          if (msg.sender_id === myUid) {
            scrollToBottom();
            return;
          }

          const enriched = await enrichPostShareMessages([msg]);
          const enrichedMsg = enriched[0] ?? msg;

          setMessages((prev) => {
            const exists = prev.find((m) => m.id === enrichedMsg.id);
            if (exists) return prev;
            return [enrichedMsg, ...prev];
          });

          await markIncomingMessagesAsRead([enrichedMsg]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friendships',
          filter: `id=eq.${chatId}`,
        },
        (payload) => {
          setFriendship(payload.new);
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.chatId === chatId && payload.payload.userId === otherUser?.id) {
          if (payload.payload.isTyping) {
            setFriendIsTyping(true);
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
              setFriendIsTyping(false);
            }, 3000);
          } else {
            clearTimeout(typingTimeoutRef.current);
            setFriendIsTyping(false);
          }
        }
      })
      .subscribe();
      
    channelRef.current = channel;

    return () => {
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(stopTypingTimeoutRef.current);
      
      if (myTypingRef.current && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: myUid, chatId, isTyping: false },
        });
      }
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [chatId, myUid, msgsTable]);


  // === Read-receipt polling ============================================================
  // Supabase realtime UPDATE events require REPLICA IDENTITY FULL on the
  // table to carry the full payload. As a reliable fallback, poll every 3 s
  // and sync the is_read status of our own sent messages.
  // We also run once immediately so the amber tick shows without delay.
  useEffect(() => {
    if (!chatId || !myUid) return;

    const syncReadReceipts = async () => {
      // Only look at confirmed (non-temp) unread messages I sent
      const myMsgIds = messagesRef.current
        .filter((m) => m.sender_id === myUid && !m.isTemp && !m.is_read)
        .map((m) => m.id);

      if (myMsgIds.length === 0) return;

      const { data } = await supabase
        .from('friend_messages')
        .select('id, is_read')
        .in('id', myMsgIds);

      if (!data || data.length === 0) return;

      // Only trigger a re-render if something actually changed
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          const fresh = data.find((d) => d.id === m.id);
          if (fresh && fresh.is_read !== m.is_read) {
            changed = true;
            return { ...m, is_read: fresh.is_read };
          }
          return m;
        });
        return changed ? next : prev;
      });
    };

    syncReadReceipts();
    const interval = setInterval(syncReadReceipts, 3000);
    return () => clearInterval(interval);
  }, [chatId, myUid]);

  const cancelRecording = async () => {
    wantsToStop.current = true;
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecording(null);
    setIsRecording(false);
    setMicIsLocked(false);
    micIsLockedRef.current = false;
    clearInterval(recordingTimerRef.current);
    setLiveLevels([]);
    peaksRef.current = [];
    if (!rec) {
      await setPlaybackAudioMode();
      return;
    }
    try {
      const { recorder: r } = rec.recorder ? rec : { recorder: rec };
      try { await r.stop(); } catch (e) {}
      clearInterval(meterIntervalRef.current);
    } catch (e) {}
    await setPlaybackAudioMode();
  };

  // Discard an un-sent voice note from the preview. We DON'T just drop the
  // reference (that left the temp file + audio session lingering, which broke
  // the next recording attempt) — we delete the file off disk and reset the
  // session so a fresh record starts clean.
  const discardVoicePreview = async (uri) => {
    setSelectedMedia(null);
    peaksRef.current = [];
      if (uri) {
        try { await deleteAsync(uri, { idempotent: true }); } catch (e) {}
      }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (e) {}
  };

  const micResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        micPan.setValue({ x: 0, y: 0 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        startRecording();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (micIsLockedRef.current) return;

        Animated.spring(micPan, {
          toValue: { x: gestureState.dx, y: Math.max(gestureState.dy, -60) },
          useNativeDriver: false,
        }).start();

        if (gestureState.dy < -60) {
          if (!micIsLockedRef.current) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setMicIsLocked(true);
            micIsLockedRef.current = true;
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (micIsLockedRef.current) return;

        if (gestureState.dx < -80) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          cancelRecording();
        } else {
          stopRecording(true); // send instantly
        }
        Animated.spring(micPan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      }
    })
  ).current;

  const handlePickMedia = async () => {
    if (msgLimitHit) {
      Alert.alert(
        'Message limit reached',
        `You can send up to ${MAX_PENDING_MSGS} messages until ${otherUser?.name ?? 'they'} accepts your request.`
      );
      return;
    }

    try {
      const asset = await pickChatMediaAsset();
      if (asset) {
        setSelectedMedia(asset);
      }
    } catch (error) {
      console.error('Could not open media picker:', error);
      Alert.alert('Media unavailable', 'Could not open your photo library. Please try again.');
    }
  };

  const openGiphyPicker = () => {
    if (msgLimitHit) {
      Alert.alert(
        'Message limit reached',
        `You can send up to ${MAX_PENDING_MSGS} messages until ${otherUser?.name ?? 'they'} accepts your request.`
      );
      return;
    }
    setGiphyPickerVisible(true);
  };

  const sendTypingStatus = useCallback((isTyping) => {
    if (!channelRef.current || !myUid || !chatId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: myUid, chatId, isTyping },
    });
  }, [myUid, chatId]);

  const handleTyping = (val) => {
    setText(val);
    
    if (val.trim().length > 0) {
      if (!myTypingRef.current) {
        sendTypingStatus(true);
        myTypingRef.current = true;
      }
      
      clearTimeout(stopTypingTimeoutRef.current);
      stopTypingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
        myTypingRef.current = false;
      }, 2000);
    } else {
      clearTimeout(stopTypingTimeoutRef.current);
      sendTypingStatus(false);
      myTypingRef.current = false;
    }
  };

  const startRecording = async () => {
    if (isPreparingRecording.current) return;
    isPreparingRecording.current = true;
    wantsToStop.current = false;

    // Optimistic UI: flip to the recording bar instantly so the press feels
    // immediate, even though the mic takes a beat to spin up below.
    setIsRecording(true);
    setRecordingDuration(0);
    recordingSecondsRef.current = 0;
    peaksRef.current = [];
    setLiveLevels([]);

    try {
      // Use the cached grant from mount; only re-prompt if we don't have it yet.
      if (!hasAudioPermissionRef.current) {
        const perm = await requestRecordingPermissionsAsync();
        hasAudioPermissionRef.current = perm.granted === true || perm.status === 'granted';
      }

      if (hasAudioPermissionRef.current) {
        // Recording session: route input to the mic. shouldDuckAndroid lowers
        // other apps' audio rather than stopping us; interruption modes keep the
        // session alive if a notification sound fires mid-record.
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
          shouldRouteThroughEarpiece: false,
          shouldPlayInBackground: false,
        });

        peaksRef.current = [];
        setLiveLevels([]);

        // SDK 57: prepare then record. No 'metering' event exists on
        // AudioRecorder; instead we poll getStatus() for the metering dBFS.
        try {
          await recorder.prepareToRecordAsync();
          recorder.record();
        } catch (createErr) {
          // After discarding a preview, the session may still be mid-teardown.
          // Reset audio mode and retry once.
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
            interruptionMode: 'duckOthers',
            shouldRouteThroughEarpiece: false,
            shouldPlayInBackground: false,
          });
          await recorder.prepareToRecordAsync();
          recorder.record();
        }

        // Poll metering at ~120ms for live level visualisation.
        meterIntervalRef.current = setInterval(() => {
          try {
            const status = recorder.getStatus();
            const dbfs = status?.metering;
            if (typeof dbfs !== 'number') return;
            // -50 dBFS (quiet room) → 0, 0 dBFS (loudest) → 1.
            const level = Math.max(0, Math.min(1, (dbfs + 50) / 50));
            peaksRef.current.push(level);
            setLiveLevels((prev) => {
              const next = prev.length >= LIVE_BARS ? prev.slice(prev.length - LIVE_BARS + 1) : prev;
              return [...next, level];
            });
          } catch (e) {}
        }, 120);

        // The user released (or cancelled) before the mic finished spinning up —
        // tear down immediately instead of leaving a zombie recording running.
        if (wantsToStop.current) {
          try { await recorder.stop(); } catch (e) {}
          clearInterval(meterIntervalRef.current);
          setIsRecording(false);
          setLiveLevels([]);
          await setPlaybackAudioMode();
          return;
        }

        // Keep a handle so stopRecording() / cancelRecording() can reach the recorder.
        recordingRef.current = { recorder };
        setRecording(recorder);

        recordingTimerRef.current = setInterval(() => {
          recordingSecondsRef.current += 1;
          setRecordingDuration(recordingSecondsRef.current);
          if (recordingSecondsRef.current >= 300) {
            stopRecording(false); // 5-min cap reached → drop into preview
          }
        }, 1000);
      } else {
        setIsRecording(false);
        Alert.alert('Permission Denied', 'Microphone access is required to send voice notes.');
      }
    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
      setLiveLevels([]);
    } finally {
      isPreparingRecording.current = false;
    }
  };

  const stopRecording = async (sendNow = false) => {
    wantsToStop.current = true;
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecording(null);
    setIsRecording(false);
    setMicIsLocked(false);
    micIsLockedRef.current = false;
    clearInterval(recordingTimerRef.current);
    // Released before the mic finished spinning up: startRecording's own
    // wantsToStop guard will tear the take down. Just reset the loud-speaker mode.
    if (!rec) {
      setLiveLevels([]);
      await setPlaybackAudioMode();
      return;
    }

    try {
      // rec is now { recorder } from startRecording. Unwrap defensively.
      const { recorder: r } = rec.recorder ? rec : { recorder: rec };

      await r.stop();
      clearInterval(meterIntervalRef.current);
      const durationMs = Math.round((r.currentTime ?? 0) * 1000);
      const uri = r.uri;
      const waveform = buildWaveform(peaksRef.current);
      setLiveLevels([]);
      if (durationMs < 200) {
        // Too short to be a real note — just reset the speaker and bail.
        await setPlaybackAudioMode();
        return;
      }

      const media = { uri, type: 'audio', mimeType: 'audio/mp4', waveform, duration: durationMs };
      if (sendNow) {
        sendRef.current?.(media);
        setPlaybackAudioMode();
      } else {
        await setPlaybackAudioMode();
        setSelectedMedia(media);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      clearInterval(meterIntervalRef.current);
      await setPlaybackAudioMode();
    }
  };

  const send = async (overrideMedia = null) => {
    // If editing a message, save the edit instead of sending new
    if (editingMessage) {
      await saveEdit(editingMessage.id, text);
      return;
    }

    const trimmed = text.trim();
    const activeMedia = overrideMedia || selectedMedia;
    if (!trimmed && !activeMedia) return;
    if (!myUid || !chatId) return;

    if (msgLimitHit) {
      Alert.alert(
        'Message limit reached',
        `You can send up to ${MAX_PENDING_MSGS} messages until ${otherUser?.name ?? 'they'} accepts your request.`
      );
      return;
    }

    const tempId = 'temp-' + Date.now();
    let type = 'text';
    if (activeMedia) {
      if (activeMedia.isGiphy) {
        type = activeMedia.type;
      } else if (activeMedia.type === 'audio') {
        type = 'audio';
      } else if (activeMedia.type === 'video') {
        type = 'video';
      } else {
        const uriStr = activeMedia.uri.toLowerCase();
        const isVid = uriStr.includes('.mp4') || uriStr.includes('.mov');
        type = isVid ? 'video' : 'image';
      }
    }

    const tempMsg = {
      id: tempId,
      [chatFk]: chatId,
      sender_id: myUid,
      text: trimmed,
      media_url: activeMedia ? activeMedia.uri : null,
      type,
      waveform: activeMedia?.waveform ?? null,
      duration: activeMedia?.duration || null,
      reply_to_id: replyingTo?.id || null,
      created_at: new Date().toISOString(),
      is_read: false,
      isTemp: true,
      status: 'sending',
    };

    setMessages((prev) => [tempMsg, ...prev]);
    if (chatId) {
      const previewText = trimmed || (
        type === 'audio' ? 'Voice message'
          : type === 'image' ? 'Photo'
            : type === 'video' ? 'Video'
              : type === GIPHY_CONTENT_TYPES.GIF ? 'GIF'
                : type === GIPHY_CONTENT_TYPES.STICKER ? 'Sticker'
                  : ''
      );

      setChatPreview(chatId, {
        id: tempId,
        text: previewText,
        created_at: tempMsg.created_at,
        sender_id: myUid,
        is_read: false,
        type,
        duration: activeMedia?.duration || null,
      });
    }
    setText('');
    const mediaToUpload = activeMedia;
    if (!overrideMedia) {
      setSelectedMedia(null);
    }
    setSentPendingCount((c) => c + 1);
    scrollToBottom();

    if (!iAmRequester && isPending) {
      autoAccept();
    }

    setUploadingMedia(true);
    let upText = null;
    if (mediaToUpload) {
      if (type === GIPHY_CONTENT_TYPES.GIF) upText = 'Sending GIF...';
      else if (type === GIPHY_CONTENT_TYPES.STICKER) upText = 'Sending sticker...';
      else if (type === 'audio') upText = 'Sending voice note...';
      else if (type === 'video') upText = 'Uploading video...';
      else upText = 'Uploading image...';
      setUploadProgressText(upText);
    }
    setReplyingTo(null);
    
    clearTimeout(stopTypingTimeoutRef.current);
    myTypingRef.current = false;
    sendTypingStatus(false);

    let finalMediaUrl = null;
    if (mediaToUpload) {
      // GIPHY requires content to be rendered from the direct URL it returns;
      // do not copy it into Supabase Storage or rewrite the URL.
      finalMediaUrl = mediaToUpload.isGiphy
        ? mediaToUpload.uri
        : await uploadChatMediaAsset(myUid, mediaToUpload);
      if (!finalMediaUrl) {
        setUploadingMedia(false);
        setUploadProgressText(null);
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'failed' } : m));
        return;
      }
    }

    const { data, error } = await supabase
      .from(msgsTable)
      .insert({
        [chatFk]: chatId,
        sender_id: myUid,
        text: trimmed,
        media_url: finalMediaUrl,
        type: type,
        reply_to_id: tempMsg.reply_to_id,
        is_read: false,
        waveform: tempMsg.waveform ?? null,
        duration: tempMsg.duration ?? null,
      })
      .select()
      .single();

    setUploadingMedia(false);
    setUploadProgressText(null);

    if (error) {
      console.log('Send error:', error.message);
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'failed' } : m));
      return;
    }

    if (mediaToUpload?.isGiphy) {
      trackGiphyAction(mediaToUpload, 'onsent', myUid);
    }

    if (chatId && data) {
      const previewText = data.text || (
        data.type === 'audio' ? 'Voice message'
          : data.type === 'image' ? 'Photo'
            : data.type === 'video' ? 'Video'
              : data.type === GIPHY_CONTENT_TYPES.GIF ? 'GIF'
                : data.type === GIPHY_CONTENT_TYPES.STICKER ? 'Sticker'
                  : ''
      );

      setChatPreview(chatId, {
        id: data.id,
        text: previewText,
        created_at: data.created_at,
        sender_id: data.sender_id,
        is_read: data.is_read,
        type: data.type,
        duration: data.duration || null,
      });
    }

    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      const alreadyExists = withoutTemp.some((m) => m.id === data.id);
      if (alreadyExists) return withoutTemp;
      return [data, ...withoutTemp];
    });

    const recipientId =
      otherUser?.id ||
      (friendship?.requester_id === myUid
        ? friendship?.recipient_id
        : friendship?.requester_id) ||
      (friendship?.sender_id === myUid
        ? friendship?.receiver_id
        : friendship?.sender_id);
    supabase
      .from('users')
      .select('name')
      .eq('id', myUid)
      .single()
      .then(({ data: me }) => {
        let msgDesc = trimmed;
        if (type === 'image') msgDesc = 'Sent an image';
        if (type === 'video') msgDesc = 'Sent a video';
        if (type === 'audio') msgDesc = 'Sent a voicenote';
        if (type === GIPHY_CONTENT_TYPES.GIF) msgDesc = 'Sent a GIF';
        if (type === GIPHY_CONTENT_TYPES.STICKER) msgDesc = 'Sent a sticker';
        sendMessageNotification(
          recipientId,
          me?.name ?? 'Someone',
          msgDesc,
          myUid
        );
      });

    scrollToBottom();
  };

  sendRef.current = send;

  const handleGiphySelect = (item) => {
    setGiphyPickerVisible(false);
    send({
      uri: item.mediaUrl,
      type: item.type,
      isGiphy: true,
      analytics: item.analytics,
    });
  };

  const name = otherUser?.name ?? 'Friend';
  const photoUrl = otherUser?.photo_urls?.[0] ?? null;
  const messagesRemaining = Math.max(MAX_PENDING_MSGS - sentPendingCount, 0);

  const closeOptionsSheet = () => {
    setOptionsSheetVisible(false);
    setOptionsSheetMode('menu');
  };

  const handleViewProfile = () => {
    closeOptionsSheet();
    if (otherUser?.id) navigation?.navigate('UserProfile', { userId: otherUser.id });
  };

  const handleClearChat = () => {
    closeOptionsSheet();
    Alert.alert('Clear Chat', 'Are you sure you want to clear this chat? This will only clear it for you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('clear_chat', { p_chat_id: chatId, p_user_id: myUid });
            if (error) throw error;
            setMessages([]);
          } catch (err) {
            Alert.alert('Error', 'Failed to clear chat. Please try again.');
          }
        },
      },
    ]);
  };

  const blockUser = async () => {
    try {
      await supabase.from('blocks').insert({ blocker_id: myUid, blocked_id: otherUser.id });
      await supabase.from('friendships').update({
        status: 'blocked',
        blocked_by: myUid,
        blocked_at: new Date().toISOString(),
      }).eq('id', chatId);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Failed to block user. Please try again.');
    }
  };

  const handleBlockUser = () => {
    closeOptionsSheet();
    Alert.alert('Block User', `Are you sure you want to block ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: blockUser },
    ]);
  };

  const handleReportReason = async (reason) => {
    closeOptionsSheet();
    try {
      await supabase.from('reports').insert({
        reporter_id: myUid,
        reported_user_id: otherUser.id,
        reason,
      });
      Alert.alert('Report Submitted', 'Thank you. Would you also like to block this user?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Block', style: 'destructive', onPress: blockUser },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  return (
    <ImageBackground
      source={activeChatTheme.uri}
      style={s.root}
      imageStyle={{ opacity: isDark ? 0.15 : 0.25 }}
      contentFit="cover"
    >
      <KeyboardAvoidingView
        style={s.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.graphite} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.headerProfile}
          onPress={() =>
            otherUser?.id && navigation?.navigate('UserProfile', { userId: otherUser.id })
          }
          activeOpacity={0.7}
        >
          <View style={s.headerAv}>
            {photoUrl ? (
              <ExpoImage
                source={{ uri: photoUrl }}
                style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
                borderRadius={21}
                onError={(e) => console.warn('[FriendChat header avatar] load failed:', e?.error ?? e)}
              />
            ) : (
              <ExpoImage
                source={{ uri: getPlaceholderUrl(name) }}
                style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
                borderRadius={21}
              />
            )}
          </View>

          <View style={s.headerTextCol}>
            <Text style={s.headerName}>{name}</Text>

            <Text style={s.headerSub}>
              {friendship?.status === 'accepted'
                ? 'Friends'
                : friendship?.status === 'pending'
                  ? 'Pending request'
                  : 'Connecting…'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={s.headerActions}>
          <TouchableOpacity 
            style={s.headerIconBtn} 
            activeOpacity={0.7}
            onPress={toggleSearch}
          >
            <Ionicons name="search-outline" size={22} color={colors.graphite} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={s.headerIconBtn} 
            activeOpacity={0.7}
            onPress={() => Alert.alert('Coming Soon', 'Voice and video calls are not available yet.')}
          >
            <Ionicons name="call-outline" size={22} color={colors.graphite} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={s.headerIconBtn} 
            activeOpacity={0.7}
            onPress={() => {
              setOptionsSheetMode('menu');
              setOptionsSheetVisible(true);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.graphite} />
          </TouchableOpacity>
        </View>
      </View>

      {isSearchVisible && (
        <Animated.View style={{
          height: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 52] }),
          opacity: searchAnim,
          overflow: 'hidden',
          paddingHorizontal: 12,
          justifyContent: 'center',
          backgroundColor: isDark ? colors.snow : colors.white,
          borderBottomWidth: 1,
          borderColor: colors.fog,
        }}>
          <TextInput
            style={{
              backgroundColor: colors.white,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 14,
              color: colors.ink,
              borderWidth: 1,
              borderColor: colors.fog,
            }}
            placeholder="Search messages..."
            placeholderTextColor={colors.ash}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </Animated.View>
      )}

      {isPending && (
        <View style={[s.banner, iAmRequester ? s.bannerPending : s.bannerIncoming]}>
          <Ionicons
            size={13}
            color={iAmRequester ? colors.stone : colors.ember}
          />

          <Text style={[s.bannerText, !iAmRequester && { color: colors.ember }]}>
            {iAmRequester
              ? `Waiting for ${name} to accept ┬╖ ${messagesRemaining} message${messagesRemaining !== 1 ? 's' : ''} remaining`
              : `${name} sent you a Spark. Replying will connect you.`}
          </Text>
        </View>
      )}

      {friendship?.status === 'accepted' && showConnectedBanner && (
        <View style={[s.banner, s.bannerAccepted]}>
          <Ionicons name="people" size={13} color={colors.ember} />
          <Text style={[s.bannerText, { color: colors.ember }]}>
            You&apos;re now connected through spark
          </Text>
        </View>
      )}

      {loading ? (
        <View style={s.loadingWrap}>
          <Text style={{ color: colors.ash }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={processedMessages}
          keyExtractor={(item) => item.id}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          renderItem={({ item }) => (
            <MemoBubble
              item={item}
              myId={myUid}
              messages={messages}
              onPressMedia={(uri, isVideo, isGiphy = false) => setViewMedia({ uri, isVideo, isGiphy })}
              onReply={setReplyingTo}
              onScrollToMessage={scrollToMessage}
              isHighlighted={item.id === highlightedMessageId}
              chatFont={chatFontObj}
              onLongPressMessage={(item) => {
                const isMe = item.sender_id === myUid;
                const options = [];
                
                if (item.status === 'failed') {
                  options.push({
                    text: 'Resend',
                    onPress: () => {
                      // Remove the failed message and re-send
                      setMessages(prev => prev.filter(m => m.id !== item.id));
                      setText(item.text || '');
                      if (item.media_url && item.type !== 'text') {
                        setSelectedMedia({
                          uri: item.media_url,
                          type: item.type,
                          waveform: item.waveform,
                          isGiphy: item.type === GIPHY_CONTENT_TYPES.GIF || item.type === GIPHY_CONTENT_TYPES.STICKER,
                        });
                      }
                      // Auto-send after a tick so the text state updates
                      setTimeout(() => send(), 100);
                    }
                  });
                  options.push({
                    text: 'Delete failed message',
                    style: 'destructive',
                    onPress: () => setMessages(prev => prev.filter(m => m.id !== item.id))
                  });
                }

                if (!item.deleted_for_everyone && item.status !== 'failed') {
                  options.push({ text: 'Reply', onPress: () => setReplyingTo(item) });
                }

                // Edit option — only for own text messages that aren't deleted
                if (isMe && !item.deleted_for_everyone && item.status !== 'failed' && item.type === 'text' && item.text) {
                  options.push({
                    text: 'Edit',
                    onPress: () => {
                      setEditingMessage(item);
                      setText(item.text);
                      setReplyingTo(null);
                    }
                  });
                }

                options.push({ 
                  text: 'Delete for me', 
                  style: 'destructive',
                  onPress: async () => {
                    setMessages((prev) => prev.filter((m) => m.id !== item.id));
                    const newDeletedBy = Array.from(new Set([...(item.deleted_by || []), myUid]));
                    const { error } = await supabase.from(msgsTable).update({ deleted_by: newDeletedBy }).eq('id', item.id);
                    if (error) Alert.alert('Error', 'Failed to delete message locally.');
                  } 
                });

                if (isMe && !item.deleted_for_everyone) {
                  options.push({ 
                    text: 'Delete for everyone', 
                    style: 'destructive',
                    onPress: async () => {
                      setMessages((prev) => prev.map((m) => m.id === item.id ? { ...m, deleted_for_everyone: true } : m));
                      const { error } = await supabase.from(msgsTable).update({ 
                        deleted_for_everyone: true, 
                        deleted_at: new Date().toISOString() 
                      }).eq('id', item.id);
                      if (error) Alert.alert('Error', 'Failed to delete message for everyone.');
                    }
                  });
                }
                
                if (!isMe && !item.deleted_for_everyone) {
                  options.push({
                    text: 'Report message',
                    style: 'destructive',
                    onPress: () => {
                      const reasons = ['Harassment', 'Spam', 'Inappropriate content', 'Other'];
                      Alert.alert('Report Message', 'Why are you reporting this message?', [
                        ...reasons.map(reason => ({
                          text: reason,
                          onPress: async () => {
                            try {
                              await supabase.from('reports').insert({
                                reporter_id: myUid,
                                reported_user_id: item.sender_id,
                                content_type: 'friend_message',
                                content_id: item.id,
                                reason: reason,
                              });
                              Alert.alert('Reported', 'Message reported successfully.');
                            } catch (e) {
                              Alert.alert('Error', 'Could not report message.');
                            }
                          }
                        })),
                        { text: 'Cancel', style: 'cancel' }
                      ]);
                    }
                  });
                }

                options.push({ text: 'Cancel', style: 'cancel' });
                Alert.alert('Message Options', '', options);
              }}
              s={s}
              colors={colors}
            />
          )}
          contentContainerStyle={s.msgList}
          inverted={true}
          onEndReached={() => loadMessages(true)}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Ionicons
                name="chatbubbles-outline"
                size={40}
                color={colors.ash}
                style={{ marginBottom: 12 }}
              />

              <Text style={s.emptyChatText}>
                {isPending && !iAmRequester ? `${name} sent you a Spark` : `Say hi to ${name}!`}
              </Text>

              {iAmRequester && isPending && (
                <Text style={s.emptyChatSub}>
                  You can send up to {MAX_PENDING_MSGS} messages before they accept.
                </Text>
              )}
            </View>
          }
        />
      )}

      {msgLimitHit && (
        <View style={s.limitWall}>
          <Ionicons name="lock-closed" size={18} color={colors.stone} />
        </View>
      )}

      {!msgLimitHit && (
        <View style={s.inputContainer}>
          {uploadProgressText && (
            <View style={[s.typingIndicator, { backgroundColor: isDark ? colors.snow : colors.white }]}>
              <ActivityIndicator size="small" color={colors.ember} style={{ marginRight: 6 }} />
              <Text style={s.typingText}>{uploadProgressText}</Text>
            </View>
          )}
          {friendIsTyping && (
            <View style={s.typingIndicator}>
              <Text style={s.typingText}>{name} is typing...</Text>
            </View>
          )}
          {replyingTo && !editingMessage && (() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            return (
            <View style={{
              flexDirection: 'row',
              backgroundColor: isDark ? colors.snow : colors.white,
              padding: 10,
              borderTopWidth: 1,
              borderColor: colors.fog,
              alignItems: 'center'
            }}>
              <View style={{ flex: 1, borderLeftWidth: 4, borderLeftColor: colors.ember, paddingLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: colors.ember, fontSize: 13, marginBottom: 2 }}>
                  Replying to {replyingTo.sender_id === myUid ? 'yourself' : name}
                </Text>
                <Text style={{ color: colors.ash, fontSize: 13 }} numberOfLines={3}>
                  {replyingTo.text || (replyingTo.type === 'audio' ? 'Voice note' : 'Media')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 6 }}>
                <Ionicons name="close-circle" size={22} color={colors.ash} />
              </TouchableOpacity>
            </View>
            );
          })()}
          {editingMessage && (() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            return (
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.emberLight,
              padding: 10,
              borderTopWidth: 1,
              borderColor: colors.ember + '40',
              alignItems: 'center'
            }}>
              <View style={{ flex: 1, borderLeftWidth: 4, borderLeftColor: colors.ember, paddingLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: colors.ember, fontSize: 13, marginBottom: 2 }}>
                  ✏️ Editing message
                </Text>
                <Text style={{ color: colors.ash, fontSize: 13 }} numberOfLines={2}>
                  {editingMessage.text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setEditingMessage(null); setText(''); }} style={{ padding: 6 }}>
                <Ionicons name="close-circle" size={22} color={colors.ember} />
              </TouchableOpacity>
            </View>
            );
          })()}
          {selectedMedia && selectedMedia.type === 'audio' && (
            <View style={{ paddingHorizontal: 10, paddingTop: 10 }}>
              <AudioPreviewPlayer
                uri={selectedMedia.uri}
                colors={colors}
                waveform={selectedMedia.waveform}
                onDelete={() => discardVoicePreview(selectedMedia.uri)}
              />
            </View>
          )}
          {selectedMedia && selectedMedia.type !== 'audio' && (
            <View style={s.previewContainer}>
              {selectedMedia.type === 'video' ? (
                <ChatVideo
                  uri={selectedMedia.uri}
                  style={s.previewImage}
                  contentFit="cover"
                  nativeControls={false}
                  autoplay={false}
                />
              ) : selectedMedia.isGiphy ? (
                <ExpoImage
                  source={{ uri: selectedMedia.uri }}
                  style={s.previewImage}
                  contentFit="contain"
                  cachePolicy="none"
                />
              ) : (
                <ExpoImagesource={{ uri: selectedMedia.uri }} style={s.previewImage} />
              )}
              {selectedMedia.type === 'video' && (
                <View style={s.previewVideoOverlay}>
                  <Ionicons name="play" size={24} color="#fff" />
                </View>
              )}
              <TouchableOpacity style={s.previewClose} onPress={() => setSelectedMedia(null)}>
                <Ionicons name="close-circle" size={24} color={colors.ash} />
              </TouchableOpacity>
            </View>
          )}
          <View style={s.inputBar}>
            {/* ══ Normal input (not recording) ══ */}
            {!isRecording && (
              <>
                <TouchableOpacity onPress={() => setAttachmentSheetVisible(true)} disabled={uploadingMedia} style={s.cameraBtn}>
                  {uploadingMedia ? (
                    <ActivityIndicator size="small" color={colors.ember} />
                  ) : (
                    <Ionicons name="add" size={30} color={colors.graphite} />
                  )}
                </TouchableOpacity>

                <TextInput
                  style={s.input}
                  value={text}
                  onChangeText={handleTyping}
                  placeholder={`Message ${name}…`}
                  placeholderTextColor={colors.ash}
                  multiline
                  maxLength={1000}
                />

                <View style={s.sendBtnContainer}>
                  <Animated.View style={{
                    transform: [
                      { scale: sendBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                      { translateX: sendBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                    ],
                    opacity: sendBtnAnim,
                    position: 'absolute',
                  }}>
                    <TouchableOpacity
                      style={s.sendBtnAnimated}
                      onPress={() => send()}
                      disabled={(!text.trim() && !selectedMedia) || uploadingMedia}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-up" size={20} color={colors.white} />
                    </TouchableOpacity>
                  </Animated.View>

                  {(!text.trim() && !selectedMedia) && (
                    <Animated.View style={[
                      s.sendBtnAnimated,
                      { position: 'absolute', backgroundColor: colors.fog },
                    ]} {...micResponder.panHandlers}>
                      <TouchableOpacity activeOpacity={0.8}>
                        <Ionicons name="mic" size={20} color={colors.graphite} />
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </View>
              </>
            )}

            {/* ══ HeldUI: long-press active, finger still on screen ══ */}
            {isRecording && !micIsLocked && (
              <View style={s.heldUI}>
                {/* Left: mic icon + timer */}
                <View style={s.heldLeft}>
                  <Animated.View style={{
                    width: 10, height: 10, borderRadius: 5,
                    backgroundColor: colors.ember, opacity: recPulse,
                  }} />
                  <Ionicons name="mic" size={20} color={colors.ember} style={{ marginLeft: 6 }} />
                  <Text style={s.heldTimer}>
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </Text>
                </View>

                {/* Center: slide to cancel — absolutely centered across the whole
                    bar so the flanking timer/mic don't shove it off-center. */}
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: micPan.x.interpolate({ inputRange: [-80, -20], outputRange: [0, 1], extrapolate: 'clamp' }),
                  }}
                >
                  <Text style={s.heldSlideText}>  slide to cancel  ⟵  </Text>
 
                </Animated.View>

                {/* Spacer so the mic button stays pinned right */}
                <View style={{ flex: 1 }} />

                {/* Right: lock hint + draggable mic button */}
                <View style={{ alignItems: 'center' }}>
                  {/* Lock pill floating above mic */}
                  <Animated.View style={[s.heldLockPill, {
                    opacity: micPan.y.interpolate({ inputRange: [-60, 0], outputRange: [1, 0.6], extrapolate: 'clamp' }),
                    transform: [{ translateY: micPan.y.interpolate({ inputRange: [-60, 0], outputRange: [-4, 0], extrapolate: 'clamp' }) }],
                  }]}>
                    <Ionicons name="lock-open-outline" size={18} color={colors.ash} />
                    <Ionicons name="chevron-up" size={14} color={colors.ash} style={{ marginTop: 2 }} />
                  </Animated.View>

                  {/* Draggable mic button */}
                  <Animated.View style={[
                    s.sendBtnAnimated,
                    { backgroundColor: colors.ember, transform: [{ translateX: micPan.x }, { translateY: micPan.y }] },
                  ]} {...micResponder.panHandlers}>
                    <Ionicons name="mic" size={20} color={colors.white} />
                  </Animated.View>
                </View>
              </View>
            )}

            {/*  HandsfreeUI: mic locked, hands-free recording  */}
            {isRecording && micIsLocked && (
              <View style={s.handsfreeUI}>
                {/* Top row: timer + waveform */}
                <View style={s.handsfreeTop}>
                  <Text style={s.handsfreeTimer}>
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <LiveAudioWaveform colors={colors} levels={liveLevels} />
                  </View>
                  <Animated.View style={{ opacity: recPulse }}>
                    <Ionicons name="radio-button-on" size={16} color={colors.ember} />
                  </Animated.View>
                </View>

                {/* Bottom row: trash ┬╖ pause ┬╖ send */}
                <View style={s.handsfreeBottom}>
                  {/* Delete */}
                  <TouchableOpacity
                    onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); cancelRecording(); }}
                    style={s.handsfreeTrashBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={24} color={colors.ash} />
                  </TouchableOpacity>

                  {/* Pause / Stop (finishes take, drops into preview) */}
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); stopRecording(false); }}
                    style={s.handsfreePauseBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pause" size={24} color={colors.ember} />
                  </TouchableOpacity>

                  {/* Send immediately */}
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); stopRecording(true); }}
                    style={[s.sendBtnAnimated, { backgroundColor: colors.ember }]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="send" size={18} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      <Modal visible={!!viewMedia} transparent={true} animationType="fade" onRequestClose={() => setViewMedia(null)}>
        <View style={s.modalBg}>
          <TouchableOpacity style={s.modalCloseBtn} onPress={() => setViewMedia(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewMedia?.isVideo ? (
            <ChatVideo
              uri={viewMedia.uri}
              style={s.modalMedia}
              contentFit="contain"
              autoplay
            />
          ) : viewMedia?.isGiphy ? (
            <ExpoImage source={{ uri: viewMedia?.uri }} style={s.modalMedia} contentFit="contain" cachePolicy="none" />
          ) : (
            <ExpoImagesource={{ uri: viewMedia?.uri }} style={s.modalMedia} contentFit="contain" />
          )}
        </View>
      </Modal>
      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        title="Share"
        options={[
          {
            key: 'media',
            label: 'Media',
            icon: 'image',
            iconColor: '#3b82f6',
            bgColor: '#3b82f620',
            onPress: handlePickMedia,
          },
          {
            key: 'giphy',
            label: 'GIFs',
            icon: 'happy-outline',
            iconColor: '#7c3aed',
            bgColor: '#7c3aed20',
            onPress: openGiphyPicker,
          },
          {
            key: 'activities',
            label: 'Activities',
            icon: 'game-controller',
            iconColor: colors.ember,
            bgColor: colors.ember + '20',
            onPress: () => navigation.navigate('Activity', {
              chatId,
              otherUserId: otherUser?.id,
              otherUserName: otherUser?.name || 'Friend',
            }),
          },
          {
            key: 'profile',
            label: 'Profile',
            icon: 'person',
            iconColor: colors.gold,
            bgColor: colors.gold + '20',
            onPress: () => {},
          },
        ]}
      />
      <GiphyPicker
        visible={giphyPickerVisible}
        onClose={() => setGiphyPickerVisible(false)}
        onSelect={handleGiphySelect}
        customerId={myUid}
      />

      {/* Chat Options Sheet */}
      <Modal visible={optionsSheetVisible} transparent animationType="slide" onRequestClose={closeOptionsSheet}>
        <View style={s.attachmentOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeOptionsSheet} />
          <View style={s.attachmentSheet}>
            <View style={s.attachmentHandle} />

            {optionsSheetMode === 'menu' ? (
              <>
                <Text style={s.attachmentTitle}>Chat Options</Text>
                <View style={s.attachmentOptions}>
                  <TouchableOpacity style={s.attachmentOption} onPress={handleViewProfile}>
                    <View style={[s.attachmentIconBg, { backgroundColor: '#3b82f620' }]}>
                      <Ionicons name="person" size={24} color="#3b82f6" />
                    </View>
                    <Text style={s.attachmentOptionText}>Profile</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={s.attachmentOption} onPress={handleClearChat}>
                    <View style={[s.attachmentIconBg, { backgroundColor: colors.gold + '20' }]}>
                      <Ionicons name="trash-outline" size={24} color={colors.gold} />
                    </View>
                    <Text style={s.attachmentOptionText}>Clear</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={s.attachmentOption} onPress={handleBlockUser}>
                    <View style={[s.attachmentIconBg, { backgroundColor: colors.ember + '20' }]}>
                      <Ionicons name="ban-outline" size={24} color={colors.ember} />
                    </View>
                    <Text style={s.attachmentOptionText}>Block</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={s.attachmentOption} onPress={() => setOptionsSheetMode('report')}>
                    <View style={[s.attachmentIconBg, { backgroundColor: '#ef444420' }]}>
                      <Ionicons name="flag-outline" size={24} color="#ef4444" />
                    </View>
                    <Text style={s.attachmentOptionText}>Report</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={s.optionsSheetHeader}>
                  <TouchableOpacity
                    style={s.optionsSheetBack}
                    onPress={() => setOptionsSheetMode('menu')}
                    hitSlop={12}
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.ink} />
                  </TouchableOpacity>
                  <Text style={[s.attachmentTitle, { marginBottom: 0, flex: 1 }]}>Report User</Text>
                  <View style={{ width: 36 }} />
                </View>
                <Text style={s.optionsSheetHint}>Please select a reason for reporting:</Text>
                <ScrollView
                  style={s.reportReasonList}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={s.reportReasonRow}
                      onPress={() => handleReportReason(reason)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.reportReasonText}>{reason}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.ash} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const MemoBubble = React.memo(Bubble, (prev, next) => {
  return prev.item.id === next.item.id && 
         prev.item.is_read === next.item.is_read &&
         prev.item.isTemp === next.item.isTemp &&
         prev.item.status === next.item.status &&
         prev.item.deleted_for_everyone === next.item.deleted_for_everyone &&
         prev.item.deleted_by?.length === next.item.deleted_by?.length &&
         prev.item.text === next.item.text &&
         prev.item.media_url === next.item.media_url &&
         prev.item.type === next.item.type &&
         prev.item.edited_at === next.item.edited_at &&
         prev.isHighlighted === next.isHighlighted &&
         prev.chatFont === next.chatFont;
});

const getStyles = (colors, shadow, isDark) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    keyboardAvoiding: {
      flex: 1,
      backgroundColor: 'transparent',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 54,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderColor: colors.fog,
      gap: 8,
      backgroundColor: isDark ? colors.snow : colors.white,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.fog,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerProfile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerAv: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFE8D6',
      overflow: 'hidden',
    },
    headerTextCol: {
      flex: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.ink,
    },
    headerSub: {
      fontSize: 12,
      color: colors.ash,
      marginTop: 1,
    },

    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
    },
    bannerPending: {
      backgroundColor: colors.snow,
      borderColor: colors.fog,
    },
    bannerIncoming: {
      backgroundColor: colors.emberLight,
      borderColor: colors.ember + '30',
    },
    bannerAccepted: {
      backgroundColor: colors.emberLight,
      borderColor: colors.ember + '30',
    },
    bannerText: {
      fontSize: 12,
      color: colors.stone,
      fontWeight: '500',
      flex: 1,
    },

    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },

    msgList: {
      padding: 16,
      paddingBottom: 8,
      backgroundColor: 'transparent',
    },
    bubbleRow: {
      marginBottom: 4,
      alignItems: 'flex-start',
      maxWidth: '80%',
    },
    bubbleRowMe: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end',
    },
    bubble: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 20,
      maxWidth: W * 0.72,
    },
    bubbleThem: {
      backgroundColor: colors.snow,
      borderBottomLeftRadius: 4,
    },
    bubbleMe: {
      backgroundColor: colors.ember,
      borderBottomRightRadius: 4,
    },
    bubbleText: {
      fontSize: 16,
      color: colors.ink,
      lineHeight: 23,
    },
    bubbleTextMe: {
      color: colors.white,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
      paddingHorizontal: 4,
    },
    metaRowMe: {
      justifyContent: 'flex-end',
    },
    bubbleTime: {
      fontSize: 11,
      color: colors.ash,
    },

    bubbleShare: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 20,
      maxWidth: W * 0.72,
      borderWidth: 1,
      borderColor: colors.fog,
    },
    shareHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    shareHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ember,
    },
    shareHeaderTextMe: {
      color: colors.white,
    },
    sharePostCard: {
      marginTop: 4,
      gap: 8,
    },
    sharePostAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sharePostAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.fog,
    },
    sharePostAuthor: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.ink,
    },
    sharePostCaption: {
      fontSize: 15,
      lineHeight: 21,
      color: colors.graphite,
    },
    sharePostImage: {
      width: '100%',
      height: 168,
      borderRadius: 12,
      backgroundColor: colors.fog,
    },

    emptyChat: {
      alignItems: 'center',
      paddingVertical: 40,
      backgroundColor: 'transparent',
    },
    emptyChatText: {
      color: colors.stone,
      fontSize: 15,
    },
    emptyChatSub: {
      color: colors.ash,
      fontSize: 13,
      marginTop: 6,
      textAlign: 'center',
      paddingHorizontal: 32,
    },

    limitWall: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 14,
      backgroundColor: isDark ? colors.emberLight : colors.snow,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.fog,
    },
    limitText: {
      flex: 1,
      fontSize: 13,
      color: colors.stone,
      lineHeight: 18,
    },

    inputContainer: {
      borderTopWidth: 1,
      borderColor: colors.fog,
      backgroundColor: isDark ? colors.snow : colors.white,
    },
    typingIndicator: {
      paddingHorizontal: 16,
      paddingTop: 8,
      backgroundColor: 'transparent',
    },
    typingText: {
      fontSize: 12,
      color: colors.ash,
      fontStyle: 'italic',
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 10,
      paddingBottom: 28,
    },
    previewContainer: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
      width: W * 0.35,
      height: W * 0.35,
      borderRadius: 12,
      overflow: 'hidden',
      alignSelf: 'flex-start',
      backgroundColor: colors.fog,
    },
    previewImage: {
      width: W * 0.35,
      height: W * 0.35,
      resizeMode: 'cover',
    },
    previewVideoOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewClose: {
      position: 'absolute',
      top: -2,
      right: -2,
      backgroundColor: colors.white,
      borderRadius: 12,
    },

    input: {
      flex: 1,
      backgroundColor: colors.snow,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.ink,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: colors.fog,
    },
    sendBtnContainer: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 2,
    },
    sendBtnAnimated: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.ember, // Restored the solid bright color!
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraBtn: {
      paddingHorizontal: 4,
      paddingVertical: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },

    /* ══ HeldUI: long-press active, finger on screen ══ */
    heldUI: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.snow : colors.white,
      borderRadius: 22,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    heldLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heldTimer: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '600',
      marginLeft: 8,
      minWidth: 36,
      fontVariant: ['tabular-nums'],
    },
    heldSlideText: {
      color: colors.graphite,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    heldLockPill: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.fog : colors.snow,
      borderRadius: 20,
      width: 36,
      paddingVertical: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.fog,
    },

    /* ══ HandsfreeUI: mic locked, hands-free recording ══ */
    handsfreeUI: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(20,20,24,0.95)' : 'rgba(245,245,247,0.95)',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    handsfreeTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    handsfreeTimer: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '600',
      marginRight: 10,
      minWidth: 36,
      fontVariant: ['tabular-nums'],
    },
    handsfreeBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    handsfreeTrashBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    handsfreePauseBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
    },

    mediaBubble: {
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    giphyBubble: {
      backgroundColor: 'transparent',
      padding: 0,
    },
    mediaContent: {
      // Remote images do not have intrinsic layout dimensions in React Native.
      // Give the chat bubble a concrete frame; contentFit="contain" preserves
      // the original image without stretching or cropping it.
      width: W * 0.65,
      height: W * 0.65,
      borderRadius: 16,
      backgroundColor: colors.fog,
    },
    giphyMediaContent: {
      width: W * 0.62,
      height: W * 0.5,
    },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCloseBtn: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 10,
      padding: 10,
    },
    modalMedia: {
      width: '100%',
      height: '100%',
    },
    
    // Attachment Sheet
    attachmentOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    attachmentSheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    attachmentHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.fog,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    attachmentTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.ink,
      marginBottom: 20,
      textAlign: 'center',
    },
    attachmentOptions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    attachmentOption: {
      alignItems: 'center',
      gap: 8,
    },
    attachmentIconBg: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachmentOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.stone,
    },
    optionsSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    optionsSheetBack: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionsSheetHint: {
      fontSize: 13,
      color: colors.ash,
      textAlign: 'center',
      marginBottom: 12,
    },
    reportReasonList: {
      maxHeight: 360,
    },
    reportReasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.fog,
    },
    reportReasonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.ink,
    },
  });

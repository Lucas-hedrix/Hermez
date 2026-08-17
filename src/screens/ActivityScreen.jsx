import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import {
  createActivity,
  inviteParticipant,
  updateParticipantStatus,
  updateActivityState,
  logActivityEvent,
  fetchActivity,
  subscribeToActivity,
} from '../services/activities';
import {
  TRUTH_PROMPTS,
  DARE_PROMPTS,
  getRandomPrompt,
  ACTIVITY_TYPE_TRUTH_OR_DARE,
} from '../constants/activities';

const { width: W } = Dimensions.get('window');

const PHASE = {
  LOADING: 'loading',
  WAITING_INVITE: 'waiting_invite',
  YOUR_TURN_CHOOSE: 'your_turn_choose',
  OPPONENT_CHOOSING: 'opponent_choosing',
  ANSWER_PROMPT: 'answer_prompt',
  WAITING_ANSWER: 'waiting_answer',
  ROUND_COMPLETE: 'round_complete',
  DECLINED: 'declined',
  ERROR: 'error',
};

export default function ActivityScreen({ route, navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const {
    chatId,
    otherUserId,
    otherUserName = 'Friend',
  } = route?.params ?? {};

  const [myUid, setMyUid] = useState(null);
  const [activityId, setActivityId] = useState(null);
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [round, setRound] = useState(1);
  const [turn, setTurn] = useState('creator'); // 'creator' | 'opponent'
  const [promptType, setPromptType] = useState(null); // 'truth' | 'dare'
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [chooserId, setChooserId] = useState(null);
  const [answers, setAnswers] = useState({}); // { [round]: { a: text, b: text } }
  const [answerText, setAnswerText] = useState('');
  const [error, setError] = useState(null);
  const [lastCompletedRound, setLastCompletedRound] = useState(null);
  const [activityCreatorId, setActivityCreatorId] = useState(null);

  const unsubRef = useRef(null);
  const isMountedRef = useRef(true);

  // ─── Resolve session ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setMyUid(session.user.id);
    })();
    return () => { isMountedRef.current = false; };
  }, []);

  // ─── Find or create the activity on mount ──────────────────────────────────
  useEffect(() => {
    if (!myUid || !otherUserId) return;

    let cancelled = false;

    (async () => {
      try {
        // Look for an existing truth_or_dare activity between these two users.
        // First get activity IDs where I'm a participant
        const { data: myActivities, error: myErr } = await supabase
          .from('activity_participants')
          .select('activity_id')
          .eq('user_id', myUid);

        if (myErr) throw myErr;

        const myActivityIds = myActivities?.map(a => a.activity_id) || [];

        // Then get activity IDs where other user is a participant
        const { data: otherActivities, error: otherErr } = await supabase
          .from('activity_participants')
          .select('activity_id')
          .eq('user_id', otherUserId);

        if (otherErr) throw otherErr;

        const otherActivityIds = otherActivities?.map(a => a.activity_id) || [];

        // Find intersection - activities both users participate in
        const commonActivityIds = myActivityIds.filter(id => otherActivityIds.includes(id));

        let actId = null;

        if (commonActivityIds.length > 0) {
          // Check for existing truth_or_dare activity among common ones
          const { data: existing, error } = await supabase
            .from('activities')
            .select('id, creator_id, status, metadata')
            .eq('type', ACTIVITY_TYPE_TRUTH_OR_DARE)
            .in('id', commonActivityIds)
            .or(`creator_id.eq.${myUid},creator_id.eq.${otherUserId}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error && error.code !== 'PGRST116') throw error;
          actId = existing?.id;
        }

        if (!actId) {
          // No existing activity — create one.
          const meta = {
            round: 1,
            turn: 'creator',
            promptType: null,
            prompt: null,
            chooserId: myUid,
            answers: {},
          };
          const { data: created, error: cErr } = await supabase
            .from('activities')
            .insert({
              type: ACTIVITY_TYPE_TRUTH_OR_DARE,
              creator_id: myUid,
              status: 'pending',
              visibility: 'private',
              metadata: meta,
            })
            .select()
            .single();
          if (cErr) throw cErr;
          actId = created.id;

          // Add the creator as accepted
          const { error: creatorParticipantError } = await supabase
            .from('activity_participants')
            .insert({ activity_id: actId, user_id: myUid, status: 'accepted' });
          if (creatorParticipantError) throw creatorParticipantError;

          // Invite the opponent
          const { error: opponentParticipantError } = await supabase
            .from('activity_participants')
            .insert({ activity_id: actId, user_id: otherUserId, status: 'invited' });
          if (opponentParticipantError) throw opponentParticipantError;

          await sendActivityInvite();
        }

        if (cancelled) return;
        setActivityId(actId);
      } catch (e) {
        if (cancelled) return;
        console.log('[ActivityScreen] setup error:', e.message);
        setError(e.message);
        setPhase(PHASE.ERROR);
      }
    })();

    return () => { cancelled = true; };
  }, [myUid, otherUserId]);

  // ─── Subscribe to realtime updates once we have an activityId ─────────────
  useEffect(() => {
    if (!activityId || !myUid) return;

    const applyActivity = (a) => {
      if (!a || !isMountedRef.current) return;

      // Handle participant change trigger - refetch full activity
      if (a.trigger === 'participant_change') {
        (async () => {
          try {
            const act = await fetchActivity(activityId);
            if (isMountedRef.current) applyActivity(act);
          } catch (e) {
            console.log('[ActivityScreen] refetch error:', e.message);
          }
        })();
        return;
      }

      const meta = a.metadata || {};
      setRound(meta.round || 1);
      setTurn(meta.turn || 'creator');
      setPromptType(meta.promptType || null);
      setCurrentPrompt(meta.prompt || null);
      setChooserId(meta.chooserId || a.creator_id);
      if (meta.answers) setAnswers(meta.answers);
      setLastCompletedRound(meta.lastCompletedRound ?? null);
      setActivityCreatorId(a.creator_id);
      setPhase(computePhase(a, myUid));
    };

    const applyEvent = (evt) => {
      console.log('[ActivityScreen] event:', evt.event_type, evt.payload);
      if (evt.event_type === 'answer' && evt.user_id !== myUid && evt.payload?.text) {
        Alert.alert(`${otherUserName}'s answer`, evt.payload.text);
      }
    };

    const unsub = subscribeToActivity(activityId, applyActivity, applyEvent);
    unsubRef.current = unsub;

    // Initial fetch
    (async () => {
      try {
        const act = await fetchActivity(activityId);
        applyActivity(act);
      } catch (e) {
        console.log('[ActivityScreen] fetch error:', e.message);
      }
    })();

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [activityId, myUid]);

  const computePhase = useCallback((activity, uid) => {
    if (!activity) return PHASE.LOADING;
    const meta = activity.metadata || {};
    const status = activity.status;
    if (status === 'declined' || status === 'cancelled') return PHASE.DECLINED;

    // If activity is still pending, check if opponent has accepted
    if (status === 'pending') {
      // We need to check participant status - if opponent is still 'invited', show waiting
      // This will be handled by the participant change event triggering a refetch
      // For now, if we're the creator and it's pending, we're waiting for invite
      const isCreator = activity.creator_id === uid;
      if (isCreator) return PHASE.WAITING_INVITE;
      // If we're not the creator and it's pending, we might be the invitee
      return PHASE.WAITING_INVITE;
    }

    const amChooser = (meta.chooserId || activity.creator_id) === uid;
    const promptSet = !!meta.prompt && !!meta.promptType;
    const currentRound = meta.round || 1;

    // A prompt has one answerer: the player who did not choose it.
    // Keep the completion screen available for games created before turns
    // advanced automatically after an answer was submitted.
    const roundAnswers = meta.answers?.[currentRound];
    if (roundAnswers?.answer || (roundAnswers?.b && !roundAnswers?.a)) {
      return PHASE.ROUND_COMPLETE;
    }

    if (!promptSet) {
      // Someone must choose truth or dare.
      return amChooser ? PHASE.YOUR_TURN_CHOOSE : PHASE.OPPONENT_CHOOSING;
    }

    // Prompt is set → the NON-chooser must answer.
    const answererId = meta.chooserId === uid ? otherUserId : uid;
    const myKey = (meta.chooserId === uid) ? 'a' : 'b';
    const hasAnswered = roundAnswers && roundAnswers[myKey];

    if (hasAnswered) {
      // I've answered, waiting for opponent
      return amChooser ? PHASE.WAITING_ANSWER : PHASE.WAITING_ANSWER;
    }
    return amChooser ? PHASE.WAITING_ANSWER : PHASE.ANSWER_PROMPT;
  }, [otherUserId]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const sendActivityInvite = async () => {
    const { data: me } = await supabase
      .from('users')
      .select('name')
      .eq('id', myUid)
      .maybeSingle();
    const inviterName = me?.name || 'Someone';
    const inviteMessage = `${inviterName} invited you to Truth or Dare.`;

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        recipient_id: otherUserId,
        sender_id: myUid,
        type: 'activity_invite',
        title: 'Truth or Dare invitation',
        message: inviteMessage,
      });
    if (notificationError) {
      console.log('[ActivityScreen] invite notification error:', notificationError.message);
    }

    import('../utils/notifications')
      .then(({ sendActivityInviteNotification }) =>
        sendActivityInviteNotification(otherUserId, inviterName, myUid)
      )
      .catch((notificationError) =>
        console.log('[ActivityScreen] invite push error:', notificationError.message)
      );
  };

  const retryActivity = async () => {
    if (!activityId || !myUid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (activityCreatorId === myUid) {
        const { error: participantError } = await supabase
          .from('activity_participants')
          .update({ status: 'invited' })
          .eq('activity_id', activityId)
          .eq('user_id', otherUserId);
        if (participantError) throw participantError;

        const initialMeta = {
          round: 1,
          turn: 'creator',
          promptType: null,
          prompt: null,
          chooserId: myUid,
          answers: {},
        };
        await updateActivityState(activityId, initialMeta, 'pending');
        await sendActivityInvite();
        setRound(1);
        setTurn('creator');
        setPromptType(null);
        setCurrentPrompt(null);
        setChooserId(myUid);
        setAnswers({});
        setLastCompletedRound(null);
        setPhase(PHASE.WAITING_INVITE);
      } else {
        await updateParticipantStatus(activityId, myUid, 'accepted');
        await updateActivityState(activityId, null, 'active');
        setPhase(PHASE.OPPONENT_CHOOSING);
      }
    } catch (e) {
      console.log('[ActivityScreen] retry error:', e.message);
      Alert.alert('Could not restart the game', e.message || 'Please try again.');
    }
  };

  const chooseType = async (type) => {
    if (!activityId || !myUid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prompt = getRandomPrompt(type);
    const meta = {
      round,
      turn: 'opponent',
      promptType: type,
      prompt,
      chooserId: myUid,
      answers: answers,
    };
    setPromptType(type);
    setCurrentPrompt(prompt);
    setTurn('opponent');

    try {
      await updateActivityState(activityId, meta, 'active');
      await logActivityEvent(activityId, myUid, 'prompt_chosen', { type, prompt });
    } catch (e) {
      console.log('[ActivityScreen] chooseType error:', e.message);
    }
  };

  const submitAnswer = async () => {
    const trimmed = answerText.trim();
    if (!trimmed || !activityId || !myUid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newAnswers = {
      ...answers,
      [round]: { ...(answers[round] || {}), answer: trimmed, answererId: myUid },
    };
    const nextRoundNum = round + 1;

    const meta = {
      round: nextRoundNum,
      turn: 'creator',
      promptType: null,
      prompt: null,
      // The player who answered becomes the next player to choose.
      chooserId: myUid,
      answers: newAnswers,
      lastCompletedRound: round,
    };

    try {
      await updateActivityState(activityId, meta, 'active');
      await logActivityEvent(activityId, myUid, 'answer', { round, text: trimmed });
      setAnswers(newAnswers);
      setAnswerText('');
      setRound(nextRoundNum);
      setTurn('creator');
      setPromptType(null);
      setCurrentPrompt(null);
      setChooserId(myUid);
      setLastCompletedRound(round);
      setPhase(PHASE.YOUR_TURN_CHOOSE);
    } catch (e) {
      console.log('[ActivityScreen] submitAnswer error:', e.message);
    }
  };

  const nextRound = async () => {
    if (!activityId || !myUid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextRoundNum = round + 1;
    const completedAnswer = answers[round];
    const nextChooser = completedAnswer?.answererId
      || (completedAnswer?.b && !completedAnswer?.a
        ? (chooserId === myUid ? otherUserId : myUid)
        : chooserId);

    const meta = {
      round: nextRoundNum,
      turn: 'creator',
      promptType: null,
      prompt: null,
      chooserId: nextChooser,
      answers,
      lastCompletedRound: round,
    };
    setRound(nextRoundNum);
    setPromptType(null);
    setCurrentPrompt(null);
    setTurn('creator');
    setChooserId(nextChooser);
    setPhase(nextChooser === myUid ? PHASE.YOUR_TURN_CHOOSE : PHASE.OPPONENT_CHOOSING);

    try {
      await updateActivityState(activityId, meta, 'active');
      await logActivityEvent(activityId, myUid, 'next_round', { round: nextRoundNum });
    } catch (e) {
      console.log('[ActivityScreen] nextRound error:', e.message);
    }
  };

  const leaveActivity = async () => {
    if (activityId && myUid) {
      try {
        await updateActivityState(activityId, null, 'cancelled');
      } catch (e) {}
    }
    navigation?.goBack();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const header = (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={leaveActivity}>
        <Ionicons name="chevron-back" size={24} color={colors.ink} />
      </TouchableOpacity>
      <View style={s.headerTextCol}>
        <Text style={s.headerTitle}>Truth or Dare</Text>
        <Text style={s.headerSub}>vs {otherUserName}</Text>
      </View>
      <View style={s.roundBadge}>
        <Text style={s.roundBadgeText}>Round {round}</Text>
      </View>
    </View>
  );

  const renderBody = () => {
    switch (phase) {
      case PHASE.LOADING:
        return (
          <View style={s.centerWrap}>
            <ActivityIndicator size="large" color={colors.ember} />
            <Text style={s.centerText}>Loading game…</Text>
          </View>
        );

      case PHASE.WAITING_INVITE: {
        const isCreator = activityCreatorId === myUid;
        return (
          <View style={s.centerWrap}>
            <Ionicons name={isCreator ? 'hourglass-outline' : 'game-controller-outline'} size={48} color={colors.ember} />
            <Text style={s.centerTitle}>
              {isCreator ? `Inviting ${otherUserName}…` : `${otherUserName} invited you to play!`}
            </Text>
            <Text style={s.centerText}>
              {isCreator ? 'Waiting for them to join the game.' : 'Ready to play?'}
            </Text>
            {isCreator ? (
              <TouchableOpacity style={s.ghostBtn} onPress={leaveActivity}>
                <Text style={s.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.primaryBtn} onPress={async () => {
                if (!activityId || !myUid) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                try {
                  await updateParticipantStatus(activityId, myUid, 'accepted');
                  await updateActivityState(activityId, null, 'active');
                  await logActivityEvent(activityId, myUid, 'joined', {});
                } catch (e) {
                  console.log('[ActivityScreen] accept error:', e.message);
                }
              }}>
                <Text style={s.primaryBtnText}>Accept & Play</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }

      case PHASE.YOUR_TURN_CHOOSE:
        return (
          <View style={s.centerWrap}>
            <Text style={s.bigTitle}>Your turn to pick!</Text>
            <Text style={s.centerText}>Choose a challenge for {otherUserName}.</Text>
            <View style={s.choiceRow}>
              <TouchableOpacity style={[s.choiceBtn, s.truthBtn]} onPress={() => chooseType('truth')}>
                <Ionicons name="bulb-outline" size={28} color="#fff" />
                <Text style={s.choiceBtnText}>Truth</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.choiceBtn, s.dareBtn]} onPress={() => chooseType('dare')}>
                <Ionicons name="flame-outline" size={28} color="#fff" />
                <Text style={s.choiceBtnText}>Dare</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case PHASE.OPPONENT_CHOOSING:
        return (
          <View style={s.centerWrap}>
            <ActivityIndicator size="large" color={colors.ember} />
            <Text style={s.centerTitle}>{otherUserName} is choosing…</Text>
            <Text style={s.centerText}>Truth or dare? The suspense!</Text>
          </View>
        );

      case PHASE.ANSWER_PROMPT:
        return (
          <View style={s.promptWrap}>
            <View style={[s.promptCard, promptType === 'truth' ? s.truthCard : s.dareCard]}>
              <View style={s.promptTagRow}>
                <Ionicons
                  name={promptType === 'truth' ? 'bulb-outline' : 'flame-outline'}
                  size={20}
                  color={promptType === 'truth' ? '#7B61FF' : '#FF4D6D'}
                />
                <Text style={[s.promptTag, { color: promptType === 'truth' ? '#7B61FF' : '#FF4D6D' }]}>
                  {promptType === 'truth' ? 'TRUTH' : 'DARE'}
                </Text>
              </View>
              <Text style={s.promptText}>{currentPrompt}</Text>
            </View>

            <Text style={s.answerLabel}>Your answer</Text>
            <TextInput
              style={s.answerInput}
              value={answerText}
              onChangeText={setAnswerText}
              placeholder="Type your answer…"
              placeholderTextColor={colors.ash}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.primaryBtn, !answerText.trim() && s.btnDisabled]}
              onPress={submitAnswer}
              disabled={!answerText.trim()}
            >
              <Text style={s.primaryBtnText}>Submit Answer</Text>
            </TouchableOpacity>
          </View>
        );

      case PHASE.WAITING_ANSWER:
        return (
          <View style={s.promptWrap}>
            <View style={[s.promptCard, promptType === 'truth' ? s.truthCard : s.dareCard]}>
              <View style={s.promptTagRow}>
                <Ionicons
                  name={promptType === 'truth' ? 'bulb-outline' : 'flame-outline'}
                  size={20}
                  color={promptType === 'truth' ? '#7B61FF' : '#FF4D6D'}
                />
                <Text style={[s.promptTag, { color: promptType === 'truth' ? '#7B61FF' : '#FF4D6D' }]}>
                  {promptType === 'truth' ? 'TRUTH' : 'DARE'}
                </Text>
              </View>
              <Text style={s.promptText}>{currentPrompt}</Text>
            </View>
            <View style={s.centerWrap}>
              <ActivityIndicator size="large" color={colors.ember} />
              <Text style={s.centerTitle}>{otherUserName} is answering…</Text>
              <Text style={s.centerText}>Hang tight!</Text>
            </View>
          </View>
        );

      case PHASE.ROUND_COMPLETE:
        return (
          <ScrollView contentContainerStyle={s.completeWrap} showsVerticalScrollIndicator={false}>
            <Ionicons name="checkmark-circle" size={52} color={colors.success} />
            <Text style={s.bigTitle}>Round {round} complete!</Text>
            {(() => {
              const ra = answers[round] || {};
              const myKey = (chooserId === myUid) ? 'a' : 'b';
              const myAnswer = ra[myKey];
              const theirAnswer = ra[myKey === 'a' ? 'b' : 'a'];
              return (
                <View style={s.answersWrap}>
                  <View style={s.answerBubbleThem}>
                    <Text style={s.answerBubbleLabel}>{otherUserName}</Text>
                    <Text style={s.answerBubbleText}>{theirAnswer || '—'}</Text>
                  </View>
                  <View style={s.answerBubbleMe}>
                    <Text style={s.answerBubbleLabel}>You</Text>
                    <Text style={s.answerBubbleText}>{myAnswer || '—'}</Text>
                  </View>
                </View>
              );
            })()}
            <TouchableOpacity style={s.primaryBtn} onPress={nextRound}>
              <Text style={s.primaryBtnText}>Next Round →</Text>
            </TouchableOpacity>
          </ScrollView>
        );

      case PHASE.DECLINED:
        return (
          <View style={s.centerWrap}>
            <Ionicons name="sad-outline" size={48} color={colors.ash} />
            <Text style={s.centerTitle}>{activityCreatorId === myUid ? `${otherUserName} declined` : 'You declined'}</Text>
            <Text style={s.centerText}>{activityCreatorId === myUid ? 'Want to send another invitation?' : 'Changed your mind?'}</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={retryActivity}>
              <Text style={s.primaryBtnText}>{activityCreatorId === myUid ? 'Try Again' : 'Accept & Play'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={() => navigation?.goBack()}>
              <Text style={s.ghostBtnText}>Back to chat</Text>
            </TouchableOpacity>
          </View>
        );

      case PHASE.ERROR:
        return (
          <View style={s.centerWrap}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.ember} />
            <Text style={s.centerTitle}>Something went wrong</Text>
            <Text style={s.centerText}>{error}</Text>
            <TouchableOpacity style={s.ghostBtn} onPress={() => navigation?.goBack()}>
              <Text style={s.ghostBtnText}>Back to chat</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={s.root}>
      <LinearGradient
        colors={isDark ? ['#1a0e16', colors.snow] : ['#ffe9ef', colors.snow]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {header}
      <View style={s.body}>{renderBody()}</View>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.fog,
    backgroundColor: isDark ? 'rgba(20,20,24,0.6)' : 'rgba(255,255,255,0.7)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center',
  },
  headerTextCol: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  headerSub: { fontSize: 12, color: colors.ash, marginTop: 1 },
  roundBadge: {
    backgroundColor: colors.emberLight, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.ember,
  },
  roundBadgeText: { fontSize: 12, fontWeight: '700', color: colors.ember },

  body: { flex: 1 },

  centerWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 12,
  },
  centerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  centerText: { fontSize: 14, color: colors.ash, textAlign: 'center', lineHeight: 20 },
  bigTitle: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 4 },

  choiceRow: { flexDirection: 'row', gap: 16, marginTop: 20 },
  choiceBtn: {
    width: 130, height: 140, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  truthBtn: { backgroundColor: '#7B61FF' },
  dareBtn: { backgroundColor: '#FF4D6D' },
  choiceBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },

  promptWrap: { flex: 1, padding: 20 },
  promptCard: {
    borderRadius: radius.lg, padding: 22, marginBottom: 24,
    borderWidth: 1.5,
    ...shadow.card,
  },
  truthCard: { backgroundColor: isDark ? colors.white : '#fff', borderColor: '#7B61FF' },
  dareCard: { backgroundColor: isDark ? colors.white : '#fff', borderColor: '#FF4D6D' },
  promptTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  promptTag: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  promptText: { fontSize: 20, fontWeight: '700', color: colors.ink, lineHeight: 28 },

  answerLabel: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  answerInput: {
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: 14, fontSize: 16, color: colors.ink,
    borderWidth: 1, borderColor: colors.fog, minHeight: 100,
    textAlignVertical: 'top',
  },

  primaryBtn: {
    marginTop: 16, backgroundColor: colors.ember,
    borderRadius: radius.full, paddingVertical: 15, alignItems: 'center',
    shadowColor: colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  completeWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  answersWrap: { width: '100%', gap: 10 },
  answerBubbleThem: {
    backgroundColor: colors.white, borderRadius: radius.md, padding: 14,
    borderLeftWidth: 4, borderLeftColor: colors.ember, borderWidth: 1, borderColor: colors.fog,
  },
  answerBubbleMe: {
    backgroundColor: colors.emberLight, borderRadius: radius.md, padding: 14,
    borderLeftWidth: 4, borderLeftColor: colors.ember,
  },
  answerBubbleLabel: { fontSize: 12, fontWeight: '700', color: colors.ember, marginBottom: 4 },
  answerBubbleText: { fontSize: 15, color: colors.ink, lineHeight: 21 },

  ghostBtn: {
    marginTop: 12, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.fog,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '700', color: colors.ink },
});

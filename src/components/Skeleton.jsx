import React from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';

/**
 * Generates a stable pseudo-random value from a seed string.
 * Used for per-element animation variation without random() calls.
 */
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/**
 * Creates varied animation params from a seed for organic, balanced feel.
 * Returns { delay, duration, shimmerWidth }
 */
const getShimmerParams = (seed, baseWidth, index = 0) => {
  const hash = hashString(seed + index);
  // Stagger: 0-400ms delay for cascade effect
  const delay = (hash % 400);
  // Duration: 1200-1800ms for varied speed — slightly slower than before
  // so the light sweep is clearly visible.
  const duration = 1200 + (hash % 600);
  // Shimmer band width: 30-50% of the element width for a soft, generous sweep.
  const shimmerWidth = Math.max(80, Math.round(baseWidth * (0.3 + (hash % 20) / 100)));

  return { delay, duration, shimmerWidth };
};

/**
 * Shimmer animation: a soft light band sweeps left-to-right across the
 * skeleton block. Uses native driver for 60fps on both platforms.
 *
 * Native: a translating gradient (transparent → white → transparent) child.
 * Web:    expo-linear-gradient falls back to a CSS linear-gradient background,
 *         and the translate transform is driven by Animated (RN-Web).
 */
const useShimmer = (width, seed, index = 0) => {
  const anim = React.useRef(new Animated.Value(0)).current;
  const { delay, duration, shimmerWidth } = getShimmerParams(seed, width, index);

  React.useEffect(() => {
    // Travel from off-screen-left (-shimmerWidth) to off-screen-right (width).
    // Slight overlap so the band fully clears the right edge before resetting.
    const startX = -shimmerWidth;
    const endX = width + shimmerWidth * 0.2;

    anim.setValue(startX);

    const loop = Animated.loop(
      Animated.sequence([
        // Initial delay for staggering
        Animated.delay(delay),
        // Main shimmer sweep
        Animated.timing(anim, {
          toValue: endX,
          duration,
          easing: Easing.bezier(0.4, 0, 0.2, 1), // Ease-out for natural light sweep
          useNativeDriver: true,
        }),
        // Brief pause between sweeps so the user perceives a discrete "flash"
        Animated.delay(120),
        // Quick reset to the start (no visible animation because it's off-screen)
        Animated.timing(anim, {
          toValue: startX,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [anim, delay, duration, shimmerWidth, width]);

  return { anim, shimmerWidth };
};

/**
 * Returns the highlight color for the shimmer band, themed for light/dark.
 * Light mode: warm white (slightly cream) for a soft, premium feel.
 * Dark mode:  a mid-grey that lifts against the dark base.
 */
const getShimmerColors = (isDark) => {
  if (isDark) {
    // 'rgba(...)' would be ideal but LinearGradient expects solid colors.
    // We rely on the gradient's transparent stops to fade the band in/out.
    return {
      stops: ['rgba(255,255,255,0)', '#3A3A3F', 'rgba(255,255,255,0)'],
      base: '#1F1F22',
    };
  }
  return {
    stops: ['rgba(255,255,255,0)', '#FFFFFF', 'rgba(255,255,255,0)'],
    base: '#E8E8EB',
  };
};

/**
 * Renders the shimmer band — a translating gradient that sweeps LTR.
 * Must be placed inside an `overflow: 'hidden'` container.
 */
const ShimmerBand = ({ anim, shimmerWidth, height, isDark }) => {
  const colors = getShimmerColors(isDark);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shimmerBand,
        { width: shimmerWidth, height, transform: [{ translateX: anim }] },
      ]}
    >
      <LinearGradient
        colors={colors.stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

/**
 * Base skeleton block — a rounded grey rectangle with a sweeping light
 * shimmer. All other skeletons compose this.
 */
export function SkeletonBox({ width = '100%', height, borderRadius = 8, style, seed = 'box' }) {
  const { isDark } = useTheme();
  const numericWidth = typeof width === 'number' ? width : 320;
  const numericHeight = typeof height === 'number' ? height : 24;
  const { anim, shimmerWidth } = useShimmer(numericWidth, seed);
  const { base } = getShimmerColors(isDark);

  return (
    <View
      style={[
        styles.box,
        { width, height, borderRadius, backgroundColor: base },
        style,
      ]}
    >
      <ShimmerBand anim={anim} shimmerWidth={shimmerWidth} height={numericHeight} isDark={isDark} />
    </View>
  );
}

/**
 * Circular skeleton (for avatars, profile images)
 */
export function SkeletonCircle({ size = 48, style, seed = 'circle' }) {
  return (
    <SkeletonBox width={size} height={size} borderRadius={size / 2} style={style} seed={seed} />
  );
}

/**
 * Text line skeleton — simulates a line of text with variable width.
 * Each line gets its own staggered shimmer for a cascading effect.
 */
export function SkeletonText({ lines = 1, lineHeight = 20, maxWidth = '100%', style, spacing = 8, seed = 'text' }) {
  const { isDark } = useTheme();
  const { base } = getShimmerColors(isDark);
  const textWidth = typeof maxWidth === 'number' ? maxWidth : 320;

  return (
    <View style={[styles.textContainer, { gap: spacing }, style]}>
      {Array.from({ length: lines }, (_, i) => {
        const lineSeed = `${seed}-line-${i}`;
        const { anim, shimmerWidth } = useShimmer(textWidth, lineSeed, i);

        return (
          <View
            key={i}
            style={[
              styles.textLine,
              { width: maxWidth, height: lineHeight, backgroundColor: base },
            ]}
          >
            <ShimmerBand anim={anim} shimmerWidth={shimmerWidth} height={lineHeight} isDark={isDark} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Profile screen skeleton — mirrors the full ProfileScreen layout
 * (cover photo + overlapping avatar, identity block, about card, stats
 * grid, action row, invite callout, hobbies, posts grid). Used for the
 * loading state of both ProfileScreen and UserProfileScreen.
 */
export function SkeletonProfileCard({ style }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.profileScreen, { backgroundColor: colors.snow }, style]}>
      {/* ── Sticky-style header bar ──────────────────────────────────────── */}
      <View style={[styles.profileHeader, { backgroundColor: colors.snow, borderBottomColor: colors.fog }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width={140} height={26} borderRadius={6} seed="profile-header-title" />
          <SkeletonBox width={180} height={14} borderRadius={4} seed="profile-header-sub" />
        </View>
        <SkeletonCircle size={44} seed="profile-header-settings" />
      </View>

      {/* ── Cover photo + overlapping avatar ────────────────────────────── */}
      <View style={styles.profileCoverWrap}>
        <SkeletonBox width={'100%'} height={220} borderRadius={0} seed="profile-cover" />
        <View style={styles.profileAvatarWrap}>
          <SkeletonCircle size={108} seed="profile-avatar" />
        </View>
      </View>

      {/* ── Identity block (name, full name, meta, vibe pill) ──────────── */}
      <View style={styles.profileCardInfo}>
        <View style={styles.profileNameRow}>
          <SkeletonBox width={180} height={32} borderRadius={8} seed="profile-name" />
          <SkeletonBox width={68} height={22} borderRadius={999} seed="profile-wallet-pill" />
        </View>
        <SkeletonBox width={130} height={16} borderRadius={4} style={styles.profileFullName} seed="profile-fullname" />
        <SkeletonBox width={210} height={14} borderRadius={4} style={styles.profileMetaLine} seed="profile-meta-line" />
        <SkeletonBox width={150} height={28} borderRadius={999} style={styles.profileVibePill} seed="profile-vibe-pill" />

        {/* ── About card ──────────────────────────────────────────────────── */}
        <View style={[styles.profileAboutCard, { borderColor: colors.fog, backgroundColor: colors.snow }]}>
          <SkeletonBox width={60} height={11} borderRadius={4} style={styles.profileAboutLabel} seed="profile-about-label" />
          <SkeletonText lines={3} lineHeight={17} maxWidth={'100%'} style={styles.profileAboutText} seed="profile-about" />
        </View>

        {/* ── Stats grid (4 columns) ─────────────────────────────────────── */}
        <View style={styles.profileStatsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.profileStatCard, { backgroundColor: colors.white }]}>
              <SkeletonBox width={32} height={20} borderRadius={6} seed={`profile-stat-value-${i}`} />
              <SkeletonBox width={50} height={10} borderRadius={4} style={styles.profileStatLabel} seed={`profile-stat-label-${i}`} />
            </View>
          ))}
        </View>

        {/* ── Action row (Edit profile / Share / Settings) ──────────────── */}
        <View style={styles.profileActionRow}>
          <SkeletonBox height={46} borderRadius={23} style={styles.profileActionPrimary} seed="profile-action-edit" />
          <SkeletonBox width={90} height={46} borderRadius={23} seed="profile-action-share" />
          <SkeletonCircle size={46} seed="profile-action-settings" />
        </View>

        {/* ── Invite callout ─────────────────────────────────────────────── */}
        <SkeletonBox height={72} borderRadius={18} style={styles.profileInvite} seed="profile-invite" />

        {/* ── Hobbies / interests pills ──────────────────────────────────── */}
        <SkeletonBox width={80} height={11} borderRadius={4} style={styles.profileSectionLabel} seed="profile-section-hobbies" />
        <View style={styles.profilePillRow}>
          <SkeletonBox width={84} height={28} borderRadius={14} seed="profile-hobby-0" />
          <SkeletonBox width={104} height={28} borderRadius={14} seed="profile-hobby-1" />
          <SkeletonBox width={72} height={28} borderRadius={14} seed="profile-hobby-2" />
          <SkeletonBox width={92} height={28} borderRadius={14} seed="profile-hobby-3" />
        </View>

        {/* ── Posts grid (2 columns × 3 rows) ────────────────────────────── */}
        <SkeletonBox width={60} height={11} borderRadius={4} style={styles.profileSectionLabel} seed="profile-section-posts" />
        <View style={styles.profilePostsGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.profilePostTile}>
              <SkeletonBox
                width={'100%'}
                height={(Dimensions.get('window').width / 2) - 24}
                borderRadius={12}
                seed={`profile-post-tile-${i}`}
              />
            </View>
          ))}
        </View>

        <View style={{ height: 80 }} />
      </View>
    </View>
  );
}

/**
 * Discover screen loading state — matches the swipe-card layout with tab controls and CTA buttons.
 */
export function SkeletonDiscoverCard({ style }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.discoverSkeleton, style]}>
      <View style={styles.discoverTopBar}>
        <SkeletonBox width={140} height={28} borderRadius={14} seed="discover-title" />
        <View style={styles.discoverTopBarActions}>
          <SkeletonCircle size={36} seed="discover-action-0" />
          <SkeletonCircle size={36} seed="discover-action-1" />
        </View>
      </View>

      <View style={[styles.discoverTabBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)' }]}>
        <SkeletonBox width={'48%'} height={34} borderRadius={17} seed="discover-tab-0" />
        <SkeletonBox width={'48%'} height={34} borderRadius={17} seed="discover-tab-1" />
      </View>

      <View style={styles.discoverSwipeCard}>
        <SkeletonBox width={'100%'} height={'100%'} borderRadius={28} seed="discover-card-bg" />

        <View style={styles.discoverCardOverlay} pointerEvents="none">
          <View style={styles.discoverCardDots}>
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonBox key={i} width={'25%'} height={5} borderRadius={3} style={styles.dotSkeleton} seed={`discover-dot-${i}`} />
            ))}
          </View>

          <View style={styles.discoverBadgeRow}>
            <SkeletonBox width={90} height={26} borderRadius={13} seed="discover-badge" />
          </View>

          <View style={[styles.discoverInfoCard, { backgroundColor: isDark ? 'rgba(18, 14, 18, 0.78)' : 'rgba(255,250,248,0.9)' }]}>
            <SkeletonText lines={1} lineHeight={26} maxWidth={170} style={styles.discoverName} seed="discover-name" />
            <SkeletonText lines={1} lineHeight={16} maxWidth={210} style={styles.discoverMeta} seed="discover-meta" />

            <View style={styles.discoverPillsRow}>
              <SkeletonBox width={72} height={24} borderRadius={12} seed="discover-pill-0" />
              <SkeletonBox width={82} height={24} borderRadius={12} seed="discover-pill-1" />
              <SkeletonBox width={68} height={24} borderRadius={12} seed="discover-pill-2" />
            </View>

            <SkeletonText lines={3} lineHeight={18} maxWidth='90%' style={styles.discoverBio} seed="discover-bio" />
          </View>
        </View>
      </View>

      <View style={styles.discoverActionRow}>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBox key={i} width={48} height={48} borderRadius={24} seed={`discover-action-btn-${i}`} />
        ))}
      </View>
    </View>
  );
}

/**
 * Post item skeleton — mimics PostsScreen post layout
 */
export function SkeletonPost({ style }) {
  return (
    <View style={[styles.postCard, style]}>
      {/* Header: avatar + name + time */}
      <View style={styles.postHeader}>
        <SkeletonCircle size={36} seed="post-avatar" />
        <View style={styles.postHeaderText}>
          <SkeletonText lines={1} lineHeight={18} maxWidth={140} seed="post-name" />
          <SkeletonText lines={1} lineHeight={14} maxWidth={80} seed="post-time" />
        </View>
      </View>

      {/* Post content: 2-4 text lines */}
      <SkeletonText lines={3} lineHeight={20} maxWidth='100%' style={styles.postContent} seed="post-content" />

      {/* Image placeholder */}
      <SkeletonBox height={200} borderRadius={12} style={styles.postImage} seed="post-image" />

      {/* Footer: reaction bar */}
      <View style={styles.postFooter}>
        <SkeletonBox width={80} height={36} borderRadius={18} seed="post-reaction-0" />
        <SkeletonBox width={80} height={36} borderRadius={18} seed="post-reaction-1" />
        <SkeletonBox width={80} height={36} borderRadius={18} seed="post-reaction-2" />
      </View>
    </View>
  );
}

/**
 * Feed list skeleton — renders multiple skeleton items
 */
export function SkeletonFeed({ itemCount = 3, ItemComponent = SkeletonPost, itemStyle, style }) {
  return (
    <View style={[styles.feed, style]}>
      {Array.from({ length: itemCount }, (_, i) => (
        <ItemComponent key={i} style={itemStyle} />
      ))}
    </View>
  );
}

/**
 * Circle card skeleton — for CirclesScreen
 */
export function SkeletonCircleCard({ style }) {
  return (
    <View style={[styles.circleCard, style]}>
      <SkeletonBox height={140} borderRadius={16} style={styles.circleCover} seed="circle-cover" />

      <View style={styles.circleContent}>
        <View style={styles.circleHeader}>
          <SkeletonCircle size={40} seed="circle-avatar" />
          <View style={styles.circleHeaderText}>
            <SkeletonText lines={1} lineHeight={22} maxWidth={160} seed="circle-name" />
            <SkeletonText lines={1} lineHeight={14} maxWidth={100} seed="circle-meta" />
          </View>
        </View>

        <SkeletonText lines={2} lineHeight={20} maxWidth='90%' style={styles.circleDesc} seed="circle-desc" />

        <View style={styles.circleMeta}>
          <SkeletonBox width={100} height={28} borderRadius={14} seed="circle-meta-0" />
          <SkeletonBox width={100} height={28} borderRadius={14} seed="circle-meta-1" />
        </View>
      </View>
    </View>
  );
}

/**
 * Activity item skeleton — for ActivityScreen
 */
export function SkeletonActivityItem({ style }) {
  return (
    <View style={[styles.activityItem, style]}>
      <View style={styles.activityHeader}>
        <SkeletonCircle size={32} seed="activity-avatar" />
        <View style={styles.activityHeaderText}>
          <SkeletonText lines={1} lineHeight={18} maxWidth={180} seed="activity-name" />
          <SkeletonText lines={1} lineHeight={13} maxWidth={120} seed="activity-time" />
        </View>
      </View>
      <SkeletonText lines={1} lineHeight={18} maxWidth='85%' style={styles.activityText} seed="activity-text" />
    </View>
  );
}

/**
 * Notification item skeleton — for NotificationsScreen
 */
export function SkeletonNotificationItem({ style }) {
  return (
    <View style={[styles.notificationItem, style]}>
      <View style={styles.notificationLeft}>
        <SkeletonCircle size={40} seed="notif-avatar" />
      </View>
      <View style={styles.notificationRight}>
        <SkeletonText lines={2} lineHeight={18} maxWidth='90%' seed="notif-text" />
        <SkeletonText lines={1} lineHeight={13} maxWidth={80} style={styles.notificationTime} seed="notif-time" />
      </View>
    </View>
  );
}

/**
 * Match card skeleton — for MatchesScreen
 */
export function SkeletonMatchCard({ style }) {
  return (
    <View style={[styles.matchCard, style]}>
      <View style={styles.matchAvatars}>
        <SkeletonCircle size={60} seed="match-avatar-0" />
        <SkeletonCircle size={60} style={styles.matchAvatarOverlap} seed="match-avatar-1" />
      </View>
      <SkeletonText lines={1} lineHeight={20} maxWidth={160} style={styles.matchNames} seed="match-names" />
      <SkeletonText lines={1} lineHeight={14} maxWidth={120} style={styles.matchTime} seed="match-time" />
      <View style={styles.matchActions}>
        <SkeletonBox width={100} height={36} borderRadius={18} seed="match-action-0" />
        <SkeletonBox width={100} height={36} borderRadius={18} seed="match-action-1" />
      </View>
    </View>
  );
}

/**
 * Search result skeleton — for SearchScreen
 */
export function SkeletonSearchResult({ style }) {
  return (
    <View style={[styles.searchResult, style]}>
      <SkeletonCircle size={44} seed="search-avatar" />
      <View style={styles.searchResultText}>
        <SkeletonText lines={1} lineHeight={20} maxWidth={180} seed="search-name" />
        <SkeletonText lines={1} lineHeight={14} maxWidth={140} seed="search-meta" />
      </View>
    </View>
  );
}

/**
 * Message row skeleton — matches chat conversations in MatchesScreen
 */
export function SkeletonChatRow({ style }) {
  return (
    <View style={[styles.chatRow, style]}>
      <SkeletonCircle size={52} seed="chat-avatar" />
      <View style={styles.chatRowText}>
        <SkeletonText lines={1} lineHeight={18} maxWidth={150} seed="chat-name" />
        <SkeletonText lines={1} lineHeight={14} maxWidth={220} seed="chat-preview" />
      </View>
      <SkeletonBox width={34} height={12} borderRadius={8} style={styles.chatRowMeta} seed="chat-time" />
    </View>
  );
}

/**
 * Spark inbox skeleton — matches the spark cards in the chat tab
 */
export function SkeletonSparkCard({ style }) {
  return (
    <View style={[styles.sparkCard, style]}>
      <View style={styles.sparkHeader}>
        <SkeletonCircle size={46} seed="spark-avatar" />
        <View style={styles.sparkHeaderText}>
          <SkeletonText lines={1} lineHeight={18} maxWidth={145} seed="spark-name" />
          <SkeletonText lines={1} lineHeight={14} maxWidth={90} seed="spark-time" />
        </View>
      </View>

      <SkeletonText lines={2} lineHeight={16} maxWidth='100%' style={styles.sparkBody} seed="spark-body" />

      <View style={styles.sparkActions}>
        <SkeletonBox width={84} height={36} borderRadius={18} seed="spark-action-0" />
        <SkeletonBox width={104} height={36} borderRadius={18} seed="spark-action-1" />
      </View>
    </View>
  );
}

/**
 * Full screen loading skeleton — replaces full-screen ActivityIndicator
 * Usage: <SkeletonScreen><SkeletonFeed /></SkeletonScreen>
 */
export function SkeletonScreen({ children, style }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.snow }, style]}>
      {children}
    </View>
  );
}

// ========== STYLES ==========
const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  shimmerBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    // width and translateX are animated; height matches parent.
  },
  textContainer: {
    gap: 8,
  },
  textLine: {
    overflow: 'hidden',
    borderRadius: 6,
  },
  // Profile screen skeleton (matches ProfileScreen / UserProfileScreen)
  profileScreen: {
    flex: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 42,
    paddingBottom: 14,
  },
  profileCoverWrap: {
    position: 'relative',
    height: 220,
    width: '100%',
  },
  profileAvatarWrap: {
    position: 'absolute',
    bottom: -54,           // overlaps cover by ~half the avatar (mirrors the real screen)
    left: 20,
    // The skeleton circle is rendered inside, so no background needed.
  },
  profileCardInfo: {
    paddingHorizontal: 20,
    paddingTop: 64,        // leaves room for the overlapping avatar
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  profileFullName: { marginTop: 6 },
  profileMetaLine: { marginTop: 10 },
  profileVibePill: { marginTop: 14, alignSelf: 'flex-start' },
  profileAboutCard: {
    marginTop: 22,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    // borderColor comes from the screen at render time; default below.
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 10,
  },
  profileAboutLabel: { marginBottom: 2 },
  profileAboutText: { gap: 8 },
  profileStatsRow: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 4,
    gap: 8,
  },
  profileStatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 6,
  },
  profileStatLabel: { marginTop: 2 },
  profileActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    marginBottom: 18,
  },
  profileActionPrimary: { flex: 1 },
  profileInvite: { marginBottom: 20 },
  profileSectionLabel: { marginTop: 22, marginBottom: 10 },
  profilePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profilePostsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profilePostTile: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  discoverSkeleton: {
    flex: 1,
    paddingTop: 8,
    gap: 12,
  },
  discoverTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  discoverTopBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discoverTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 204, 0.9)',
    overflow: 'hidden',
  },
  discoverSwipeCard: {
    flex: 1,
    position: 'relative',
    borderRadius: 28,
    overflow: 'hidden',
    minHeight: 520,
  },
  discoverCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  discoverCardDots: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    zIndex: 2,
  },
  dotSkeleton: {
    opacity: 0.5,
  },
  discoverBadgeRow: {
    alignItems: 'flex-start',
    marginTop: 6,
    zIndex: 2,
  },
  discoverInfoCard: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  discoverName: {
    alignSelf: 'flex-start',
  },
  discoverMeta: {
    alignSelf: 'flex-start',
  },
  discoverPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  discoverBio: {
    alignSelf: 'flex-start',
    width: '100%',
    marginTop: 2,
  },
  discoverActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    paddingTop: 2,
    paddingBottom: 2,
  },
  postCard: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  postHeaderText: {
    gap: 4,
    flex: 1,
  },
  postContent: {
    gap: 6,
  },
  postImage: {
    marginTop: 4,
  },
  postFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  feed: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  circleCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  circleCover: {},
  circleContent: {
    padding: 16,
    gap: 12,
  },
  circleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  circleHeaderText: {
    flex: 1,
    gap: 4,
  },
  circleDesc: {
    gap: 6,
  },
  circleMeta: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  activityItem: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  activityHeaderText: {
    flex: 1,
    gap: 2,
  },
  activityText: {
    marginLeft: 42,
  },
  notificationItem: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  notificationLeft: {
    flexShrink: 0,
  },
  notificationRight: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  notificationTime: {
    alignSelf: 'flex-start',
  },
  matchCard: {
    padding: 16,
    gap: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  matchAvatars: {
    flexDirection: 'row',
    marginTop: -20,
  },
  matchAvatarOverlap: {
    marginLeft: -20,
  },
  matchNames: {},
  matchTime: {},
  matchActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchResultText: {
    flex: 1,
    gap: 4,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  chatRowText: {
    flex: 1,
    gap: 6,
  },
  chatRowMeta: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  sparkCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  sparkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sparkHeaderText: {
    flex: 1,
    gap: 4,
  },
  sparkBody: {
    marginBottom: 12,
  },
  sparkActions: {
    flexDirection: 'row',
    gap: 10,
  },
  screen: {
    flex: 1,
  },
});

export default {
  Box: SkeletonBox,
  Circle: SkeletonCircle,
  Text: SkeletonText,
  ProfileCard: SkeletonProfileCard,
  Post: SkeletonPost,
  Feed: SkeletonFeed,
  CircleCard: SkeletonCircleCard,
  ActivityItem: SkeletonActivityItem,
  NotificationItem: SkeletonNotificationItem,
  MatchCard: SkeletonMatchCard,
  SearchResult: SkeletonSearchResult,
  ChatRow: SkeletonChatRow,
  SparkCard: SkeletonSparkCard,
  Screen: SkeletonScreen,
};

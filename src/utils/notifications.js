/**
 * notifications.js
 *
 * Handles:
 *  1. Requesting permission and getting the Expo push token.
 *  2. Storing the token in Supabase so other users can address notifications to this device.
 *  3. Sending a push notification to a recipient via the Expo Push API.
 *
 * Architecture note:
 *  Notifications are sent client-side at the moment a message is inserted.
 *  The sender's app fetches the recipient's push token from the `users` table,
 *  then POSTs to https://exp.host/--/api/v2/push/send.
 *  This is simple, works with Expo Go, and requires no server-side code.
 */


import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../supabase/client';

// ── Global notification behaviour ──────────────────────────────────────────
// Push notifications are native-only; skip setup on web to avoid runtime errors.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ── Android channel ────────────────────────────────────────────────────────
// Android requires a notification channel. Create it once at module load.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B35',
  });
}

/**
 * registerForPushNotifications
 *
 * Requests permission, retrieves the Expo push token, and saves it to the
 * authenticated user's row in the `users` table.
 *
 * @param {string} userId - The authenticated user's UUID.
 * @returns {string|null} The Expo push token, or null if unavailable.
 */
export async function registerForPushNotifications(userId) {
  if (Platform.OS === 'web') return null;

  // Push tokens only work on real devices (iOS simulators will fail, but Android emulators with Play Services might work).
  if (!Device.isDevice && Platform.OS === 'ios') {
    console.log('[Notifications] Skipped: push tokens do not work on iOS simulators.');
    return null;
  }

  // Check / request permission.
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    import('react-native').then(({ Alert, Linking }) => {
      Alert.alert(
        'Permission Denied',
        'Please enable notifications for Cupid in your phone settings to receive message alerts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
    });
    console.log('[Notifications] Permission denied.');
    return null;
  }

  // Expo SDK 48+ requires a projectId.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.log('[Notifications] No EAS projectId found in app.json.');
    return null;
  }

  const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData;

  if (!token) return null;

  // Persist the token so other users can send notifications to this device.
  const { error } = await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    console.log('[Notifications] Failed to save push token:', error.message);
  } else {
    console.log('[Notifications] Token registered:', token);
  }

  return token;
}

/**
 * promptForPushNotificationsIfNeeded
 * 
 * Soft-prompts the user to enable notifications if they haven't been asked yet.
 * If they've already granted OS permissions, it silently refreshes the token.
 * 
 * @param {string} userId - The authenticated user's UUID.
 */
export async function promptForPushNotificationsIfNeeded(userId) {
  if (Platform.OS === 'web') return;

  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  
  if (existingStatus === 'granted') {
    // Already granted at OS level, just silently update token
    registerForPushNotifications(userId);
  } else {
    const hasAsked = await AsyncStorage.getItem('has_asked_push_' + userId);
    if (!hasAsked) {
      import('react-native').then(({ Alert }) => {
        Alert.alert(
          'Enable Notifications',
          'Would you like to receive push notifications when you get new posts, messages, and matches?',
          [
            { 
              text: 'Not Now', 
              onPress: () => AsyncStorage.setItem('has_asked_push_' + userId, 'true'), 
              style: 'cancel' 
            },
            { 
              text: 'Yes, Enable', 
              onPress: () => {
                AsyncStorage.setItem('has_asked_push_' + userId, 'true');
                registerForPushNotifications(userId);
              }
            }
          ]
        );
      });
    }
  }
}

/**
 * sendMessageNotification
 *
 * Looks up the recipient's push token and sends a notification via the
 * Expo Push API. Silently does nothing if the recipient has no token.
 *
 * @param {string} recipientId  - The recipient's user UUID.
 * @param {string} senderName   - Display name shown as the notification title.
 * @param {string} messageText  - The message body (truncated for long texts).
 */
export async function sendMessageNotification(recipientId, senderName, messageText, senderId) {
  if (!recipientId || !senderName) return;

  try {
    // Fetch the recipient's stored push token.
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const body =
      messageText && messageText.length > 100
        ? messageText.slice(0, 97) + '…'
        : messageText ?? '📩 New message';

    const payload = {
      to: data.push_token,
      channelId: 'messages',   // Android channel
      sound: 'default',
      title: senderName,
      body,
      data: { type: 'friend_message', senderId: senderId ?? recipientId },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result?.data?.status === 'error') {
      console.log('[Notifications] Push error:', result.data.message);
    }
  } catch (e) {
    // Never let a notification failure break the send flow.
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

/**
 * Sends a Truth or Dare invitation to the recipient's device.
 */
export async function sendActivityInviteNotification(recipientId, senderName, senderId) {
  if (!recipientId || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: data.push_token,
        channelId: 'messages',
        sound: 'default',
        title: 'Truth or Dare invitation',
        body: `${senderName} invited you to play.`,
        data: { type: 'activity_invite', senderId: senderId ?? recipientId },
      }),
    });

    const result = await response.json();
    if (result?.data?.status === 'error') {
      console.log('[Notifications] Activity invite push error:', result.data.message);
    }
  } catch (e) {
    console.log('[Notifications] Activity invite push error:', e.message);
  }
}

/**
 * sendSparkNotification
 *
 * Looks up the recipient's push token and sends a notification via the
 * Expo Push API for a new spark. Silently does nothing if the recipient has no token.
 *
 * @param {string} recipientId  - The recipient's user UUID.
 * @param {string} senderName   - Display name of the sender.
 * @param {string} messageText  - The spark message body.
 * @param {string} senderId     - The sender's user UUID.
 */
export async function sendSparkNotification(recipientId, senderName, messageText, senderId) {
  if (!recipientId || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const payload = {
      to: data.push_token,
      channelId: 'messages',
      sound: 'default',
      title: 'New Spark!',
      body: `${senderName} sent you a spark: ${messageText ?? 'Check it out!'}`,
      data: { type: 'spark', senderId: senderId ?? recipientId },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result?.data?.status === 'error') {
      console.log('[Notifications] Push error:', result.data.message);
    }
  } catch (e) {
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

/**
 * sendPostNotification
 *
 * Looks up the push tokens for multiple recipients and sends a notification
 * via the Expo Push API for a new feed or circle post.
 *
 * @param {string[]} recipientIds - Array of recipient user UUIDs.
 * @param {string} senderName     - Display name of the sender.
 * @param {string|null} circleName- The name of the circle, or null if it's a feed post.
 */
export async function sendPostNotification(recipientIds, senderName, circleName, postId = null) {
  if (!recipientIds || recipientIds.length === 0 || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .in('id', recipientIds)
      .not('push_token', 'is', null);

    if (error || !data || data.length === 0) return;

    const tokens = data.map(u => u.push_token).filter(Boolean);
    if (tokens.length === 0) return;

    const title = circleName ? `New post in ${circleName}` : 'New Post!';
    const body = circleName 
      ? `${senderName} posted in ${circleName}.`
      : `${senderName} just made a new post.`;

    const messages = tokens.map(token => ({
      to: token,
      channelId: 'messages',
      sound: 'default',
      title,
      body,
      data: { type: 'post', postId: postId ?? undefined },
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    if (result?.data) {
      const errors = result.data.filter(t => t.status === 'error');
      if (errors.length > 0) {
        console.log('[Notifications] Push errors:', errors.map(e => e.message).join(', '));
      }
    }
  } catch (e) {
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

/**
 * sendLikeNotification
 *
 * Looks up the recipient's push token and sends a notification
 * via the Expo Push API for a new post like.
 *
 * @param {string} recipientId  - The recipient's user UUID.
 * @param {string} senderName   - Display name of the sender.
 */
export async function sendLikeNotification(recipientId, senderName, postId = null) {
  if (!recipientId || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const payload = {
      to: data.push_token,
      channelId: 'messages',
      sound: 'default',
      title: 'New Like!',
      body: `${senderName} liked your post.`,
      data: { type: 'like', postId: postId ?? undefined },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result?.data?.status === 'error') {
      console.log('[Notifications] Push error:', result.data.message);
    }
  } catch (e) {
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

/**
 * sendCommentNotification
 *
 * Looks up the recipient's push token and sends a notification
 * via the Expo Push API for a new post comment.
 *
 * @param {string} recipientId  - The recipient's user UUID.
 * @param {string} senderName   - Display name of the sender.
 * @param {string} commentText  - A snippet of the comment text.
 */
export async function sendCommentNotification(recipientId, senderName, commentText, { postId = null, commentId = null } = {}) {
  if (!recipientId || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const snippet = commentText.length > 50 ? commentText.substring(0, 50) + '...' : commentText;

    const payload = {
      to: data.push_token,
      channelId: 'messages',
      sound: 'default',
      title: 'New Comment!',
      body: `${senderName}: "${snippet}"`,
      data: {
        type: 'comment',
        postId: postId ?? undefined,
        commentId: commentId ?? undefined,
      },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result?.data?.status === 'error') {
      console.log('[Notifications] Push error:', result.data.message);
    }
  } catch (e) {
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

export async function sendMentionNotification(recipientId, senderName, snippet, { postId = null, commentId = null } = {}) {
  if (!recipientId || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const body = snippet.length > 50 ? snippet.substring(0, 50) + '...' : snippet;

    const payload = {
      to: data.push_token,
      channelId: 'messages',
      sound: 'default',
      title: 'You were mentioned',
      body: `${senderName}: "${body}"`,
      data: {
        type: 'mention',
        postId: postId ?? undefined,
        commentId: commentId ?? undefined,
      },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result?.data?.status === 'error') {
      console.log('[Notifications] Push error:', result.data.message);
    }
  } catch (e) {
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

/**
 * sendFriendRequestNotification
 *
 * Looks up the recipient's push token and sends a notification
 * via the Expo Push API for a new friend request.
 *
 * @param {string} recipientId  - The recipient's user UUID.
 * @param {string} senderName   - Display name of the sender.
 * @param {string} senderId     - The sender's user UUID.
 */
export async function sendFriendRequestNotification(recipientId, senderName, senderId) {
  if (!recipientId || !senderName) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !data?.push_token) return;

    const payload = {
      to: data.push_token,
      channelId: 'messages',
      sound: 'default',
      title: 'New Friend Request!',
      body: `${senderName} sent you a friend request.`,
      data: { type: 'friend_request', senderId: senderId ?? recipientId },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result?.data?.status === 'error') {
      console.log('[Notifications] Push error:', result.data.message);
    }
  } catch (e) {
    console.log('[Notifications] Unexpected error:', e.message);
  }
}

/**
 * Routes in-app and push notification taps to the right screen.
 */
export function handleNotificationNavigation(data, navigation) {
  if (!data || !navigation) return false;

  const type = data.type;
  const postId = data.postId || data.post_id;
  const commentId = data.commentId || data.comment_id;

  if (postId && navigation.openFeedPost) {
    navigation.openFeedPost(postId, commentId || null);
    return true;
  }

  if (type === 'comment' || type === 'like' || type === 'mention' || type === 'post' || type === 'update') {
    if (postId && navigation.openFeedPost) {
      navigation.openFeedPost(postId, commentId || null);
      return true;
    }
    if (navigation.switchTab) {
      navigation.switchTab('Feed');
      return true;
    }
  }

  if (type === 'spark' && data.senderId) {
    navigation.navigate?.('UserProfile', { userId: data.senderId });
    return true;
  }

  if (type === 'friend_request' && data.senderId) {
    navigation.navigate?.('UserProfile', { userId: data.senderId });
    return true;
  }

  if (type === 'message' && data.chatId) {
    navigation.navigate?.('FriendChat', { chatId: data.chatId });
    return true;
  }

  return false;
}

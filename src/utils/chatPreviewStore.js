import AsyncStorage from '@react-native-async-storage/async-storage';

export const FRIENDS_CACHE_KEY = '@cupid_friends_cache';

const patches = {};
const listeners = new Set();

function lastMessageTime(friend) {
  const iso = friend?.lastMessage?.created_at || friend?.created_at;
  return iso ? new Date(iso).getTime() : 0;
}

export function sortFriendsByPreview(friends) {
  return [...friends].sort((a, b) => lastMessageTime(b) - lastMessageTime(a));
}

function isTempId(id) {
  return typeof id === 'string' && id.startsWith('temp-');
}

export function setChatPreview(friendshipId, lastMessage) {
  if (!friendshipId || !lastMessage) return;

  patches[friendshipId] = lastMessage;
  persistPreviewToCache(friendshipId, lastMessage);
  listeners.forEach((fn) => fn(friendshipId, lastMessage));
}

export function getChatPreview(friendshipId) {
  return patches[friendshipId] ?? null;
}

export function subscribeChatPreview(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function mergeFriendWithPreview(friend) {
  const patch = patches[friend.id];
  if (!patch) return friend;

  const existing = friend.lastMessage;
  const existingTime = existing?.created_at ? new Date(existing.created_at).getTime() : 0;
  const patchTime = patch.created_at ? new Date(patch.created_at).getTime() : 0;

  // Backend caught up with (or passed) the optimistic preview — drop the patch.
  if (existing && !isTempId(existing.id) && existingTime >= patchTime) {
    delete patches[friend.id];
    return friend;
  }

  if (patchTime >= existingTime) {
    return { ...friend, lastMessage: patch };
  }

  return friend;
}

export function applyChatPreviews(friends) {
  if (!Array.isArray(friends) || friends.length === 0) return friends ?? [];
  return sortFriendsByPreview(friends.map(mergeFriendWithPreview));
}

async function persistPreviewToCache(friendshipId, lastMessage) {
  try {
    const cached = await AsyncStorage.getItem(FRIENDS_CACHE_KEY);
    if (!cached) return;

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const updated = applyChatPreviews(
      parsed.map((f) => (f.id === friendshipId ? { ...f, lastMessage } : f))
    );
    await AsyncStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {}
}

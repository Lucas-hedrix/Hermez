// Shared vibe definitions for Discover, Profile, Search, etc.

export const VIBES = [
  { id: 'All', label: 'All Vibes', icon: 'sparkles', color: '#FFFFFF' },
  { id: 'Dating', label: 'Dating', icon: 'heart', color: '#FF4D6D' },
  { id: 'Friendship', label: 'Friendship', icon: 'happy', color: '#20C997' },
  { id: 'Gaming', label: 'Gaming', icon: 'game-controller', color: '#7B61FF' },
  { id: 'Study', label: 'Study', icon: 'book', color: '#F9C22E' },
  { id: 'Hangout', label: 'Hangout', icon: 'cafe', color: '#FF9F1C' },
  { id: 'Chat', label: 'Chat', icon: 'chatbubbles', color: '#00F0FF' },
];

/** Vibes a user can set on their own profile (excludes All / Dating filter-only). */
export const PROFILE_VIBES = VIBES.filter((v) => !['All', 'Dating'].includes(v.id));

export function getVibeColor(id) {
  return VIBES.find((v) => v.id === id)?.color || '#FF4D6D';
}

export function getVibeIcon(id) {
  return VIBES.find((v) => v.id === id)?.icon || 'sparkles';
}

// Keep activity copy separate from the stored vibe id. This lets chat use
// natural language while still inheriting the colour already assigned to a
// vibe everywhere else in the app.
export function getVibeActivityLabel(id) {
  const labels = {
    Gaming: 'Gaming',
    Study: 'Studying',
    Hangout: 'Out for coffee',
    Chat: 'Looking to chat',
    Friendship: 'Feeling social',
  };

  return labels[id] || 'Sharing a vibe';
}

export function getVibeMeta(id) {
  return VIBES.find((v) => v.id === id) ?? null;
}

export function isVibeExpired(vibeSetAt) {
  if (!vibeSetAt) return true;
  const setAt = new Date(vibeSetAt).getTime();
  return Date.now() - setAt > 24 * 60 * 60 * 1000;
}

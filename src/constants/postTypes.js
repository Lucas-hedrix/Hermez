// Shared post-type definitions for the Feed (compose + render).
// Mirrors the shape of constants/vibes.js — a pure data module, no theme import.
// Colors are the theme's vibe palette (theme/index.js) kept in sync by value so
// this stays a static constant like VIBES.

export const POST_TYPES = [
  {
    id: 'thought',
    label: 'Thought',
    icon: 'chatbubble-ellipses',
    color: '#00F0FF', // vibeChat
    placeholder: "What's on your mind?",
  },
  {
    id: 'moment',
    label: 'Moment',
    icon: 'image',
    color: '#FF9F1C', // vibeHangout
    placeholder: 'Share a moment…',
    suggestsImage: true,
  },
  {
    id: 'question',
    label: 'Question',
    icon: 'help-circle',
    color: '#7B61FF', // vibeGaming
    placeholder: 'Ask the feed something…',
  },
  {
    id: 'challenge',
    label: 'Challenge',
    icon: 'flag',
    color: '#20C997', // vibeFriendship
    placeholder: 'Set a challenge…',
  },
  {
    id: 'hot_take',
    label: 'Hot Take',
    icon: 'flame',
    color: '#FF4D6D', // ember
    placeholder: 'Drop a hot take…',
  },
  {
    id: 'vibe',
    label: 'Vibe',
    icon: 'musical-notes',
    color: '#F9C22E', // gold
    placeholder: "What's the vibe?",
  },
];

export const DEFAULT_POST_TYPE = POST_TYPES[0]; // thought

/** Resolve a post_type id to its meta, falling back to Thought.
 *  Fallback covers legacy rows where post_type is null/unknown. */
export function getPostType(id) {
  return POST_TYPES.find((t) => t.id === id) ?? DEFAULT_POST_TYPE;
}
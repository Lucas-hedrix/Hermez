/**
 * Centralized hobby/interest definitions with Ionicons icons and special colors.
 * Used by RegisterScreen, ProfileSetupScreen, EditProfileScreen, and Profile screens.
 *
 * Each interest has:
 * - id: unique identifier for storage
 * - label: display name
 * - icon: Ionicons name from @expo/vector-icons
 * - color: hex color for selected state (matches vibe palette from theme/index.js)
 */

export const INTERESTS = [
  // Gaming & Tech
  {
    id: 'gaming',
    label: 'Gaming',
    icon: 'game-controller',
    color: '#7B61FF', // purple - matches vibeGaming
  },
  {
    id: 'technology',
    label: 'Technology',
    icon: 'laptop',
    color: '#00B4D8', // cyan/blue - matches vibeTech
  },

  // Creative & Arts
  {
    id: 'art',
    label: 'Art',
    icon: 'brush',
    color: '#A855F7', // purple - matches vibeArt
  },
  {
    id: 'writing',
    label: 'Writing',
    icon: 'book-outline',
    color: '#3B82F6', // blue - matches vibeWriting
  },
  {
    id: 'photography',
    label: 'Photography',
    icon: 'camera',
    color: '#F59E0B', // amber - matches vibePhotography
  },
  {
    id: 'dancing',
    label: 'Dancing',
    icon: 'musical-notes',
    color: '#EC4899', // pink - matches vibeDancing
  },
  {
    id: 'music',
    label: 'Music',
    icon: 'musical-notes',
    color: '#F59E0B', // gold/amber - matches vibeMusic
  },

  // Fashion & Style
  {
    id: 'fashion',
    label: 'Fashion',
    icon: 'shirt-outline',
    color: '#EC4899', // pink/rose - matches vibeFashion
  },

  // Food & Cooking
  {
    id: 'food',
    label: 'Food',
    icon: 'restaurant',
    color: '#F97316', // orange - matches vibeFood
  },
  {
    id: 'cooking',
    label: 'Cooking',
    icon: 'restaurant-outline',
    color: '#F97316', // orange
  },

  // Fitness & Sports
  {
    id: 'fitness',
    label: 'Fitness',
    icon: 'barbell',
    color: '#10B981', // green - matches vibeFitness
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: 'football',
    color: '#F97316', // orange - matches vibeSports
  },
  {
    id: 'yoga',
    label: 'Yoga',
    icon: 'body',
    color: '#14B8A6', // teal - matches vibeYoga
  },
  {
    id: 'hiking',
    label: 'Hiking',
    icon: 'footsteps',
    color: '#10B981', // green
  },
  {
    id: 'swimming',
    label: 'Swimming',
    icon: 'water',
    color: '#06B6D4', // cyan/blue
  },
  {
    id: 'cycling',
    label: 'Cycling',
    icon: 'bicycle',
    color: '#06B6D4', // cyan
  },

  // Lifestyle
  {
    id: 'travel',
    label: 'Travel',
    icon: 'airplane',
    color: '#06B6D4', // cyan - matches vibeTravel
  },
  {
    id: 'reading',
    label: 'Reading',
    icon: 'book',
    color: '#3B82F6', // blue
  },
  {
    id: 'movies',
    label: 'Movies',
    icon: 'film',
    color: '#A855F7', // purple - matches vibeMovies
  },
  {
    id: 'nature',
    label: 'Nature',
    icon: 'leaf',
    color: '#10B981', // green - matches vibeNature
  },
];

// Helper: Get interest by ID
export function getInterestById(id) {
  return INTERESTS.find(i => i.id === id);
}

// Helper: Get interests by IDs (for displaying selected)
export function getInterestsByIds(ids) {
  if (!ids || !Array.isArray(ids)) return [];
  return ids.map(id => getInterestById(id)).filter(Boolean);
}

// Export default for convenience
export default INTERESTS;
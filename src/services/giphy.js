import { Platform } from 'react-native';

const GIPHY_API_ROOT = 'https://api.giphy.com/v1';

// GIPHY's REST API is designed to be called from the client. Expo exposes only
// EXPO_PUBLIC_* variables to the app bundle, so use a dedicated GIPHY client
// key here — never a Supabase service-role or other secret key.
const GIPHY_API_KEY = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_GIPHY_API_KEY_IOS
  : Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_GIPHY_API_KEY_ANDROID
    : process.env.EXPO_PUBLIC_GIPHY_API_KEY_WEB;

const GIPHY_KEY_NAME = Platform.OS === 'ios'
  ? 'EXPO_PUBLIC_GIPHY_API_KEY_IOS'
  : Platform.OS === 'android'
    ? 'EXPO_PUBLIC_GIPHY_API_KEY_ANDROID'
    : 'EXPO_PUBLIC_GIPHY_API_KEY_WEB';

export const GIPHY_CONTENT_TYPES = {
  GIF: 'giphy_gif',
  STICKER: 'giphy_sticker',
};

export function hasGiphyApiKey() {
  return Boolean(GIPHY_API_KEY);
}

function asGiphyItem(gif, type) {
  const images = gif.images ?? {};
  const preview = images.fixed_width?.webp || images.fixed_width?.url || images.fixed_height?.webp || images.fixed_height?.url;
  // Use the direct rendition URL returned by GIPHY. Do not rewrite, proxy, or
  // upload this URL: GIPHY requires media to be served directly from its CDN.
  const mediaUrl = type === GIPHY_CONTENT_TYPES.STICKER
    ? (images.fixed_width?.webp || images.fixed_height?.webp || images.original?.webp || images.original?.url)
    : (images.downsized?.url || images.fixed_width?.url || images.original?.url);

  if (!preview || !mediaUrl) return null;

  return {
    id: gif.id,
    type,
    previewUrl: preview,
    mediaUrl,
    altText: gif.alt_text || gif.title || (type === GIPHY_CONTENT_TYPES.STICKER ? 'GIPHY sticker' : 'GIPHY GIF'),
    analytics: gif.analytics ?? null,
  };
}

/** Fetch a page from GIPHY's documented Trending or Search REST endpoints. */
export async function fetchGiphyContent({ type, query = '', offset = 0, limit = 24, customerId }) {
  if (!GIPHY_API_KEY) {
    throw new Error(`Missing ${GIPHY_KEY_NAME}. Add it to your .env file and restart Expo.`);
  }

  const collection = type === GIPHY_CONTENT_TYPES.STICKER ? 'stickers' : 'gifs';
  const endpoint = query.trim() ? 'search' : 'trending';
  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: String(limit),
    offset: String(offset),
    rating: 'g',
    bundle: 'messaging_non_clips',
  });

  if (query.trim()) params.set('q', query.trim().slice(0, 50));
  if (customerId) params.set('customer_id', customerId);
  if (type === GIPHY_CONTENT_TYPES.STICKER) params.set('remove_low_contrast', 'true');

  const response = await fetch(`${GIPHY_API_ROOT}/${collection}/${endpoint}?${params.toString()}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.meta?.msg || 'GIPHY could not load content.');
  }

  return {
    items: (payload?.data ?? []).map((gif) => asGiphyItem(gif, type)).filter(Boolean),
    pagination: payload?.pagination ?? { offset, count: 0, total_count: 0 },
  };
}

/** Register GIPHY's onload, onclick, or onsent action without blocking the UI. */
export function trackGiphyAction(item, action, customerId) {
  const trackingUrl = item?.analytics?.[action]?.url;
  if (!trackingUrl || !customerId) return;

  try {
    const url = new URL(trackingUrl);
    url.searchParams.set('customer_id', customerId);
    url.searchParams.set('ts', String(Date.now()));
    fetch(url.toString()).catch(() => {});
  } catch {
    // Analytics must never interrupt selecting or sending a message.
  }
}

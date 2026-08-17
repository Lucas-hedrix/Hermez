// supabase/storage.js — photo upload / delete helpers
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Alert } from 'react-native';
import { supabase } from './client';

const BUCKET = 'photos';

// WebP conversion tuning — images are downscaled to this longest edge (never
// upscaled) and re-encoded as WebP to shrink storage. Videos/audio/GIFs are
// left untouched.
const MAX_IMAGE_DIMENSION = 1600;
const WEBP_QUALITY = 0.8; // 0–1; 1 = no compression

// ── Convert a picked image to WebP (best-effort) ──────────────────────────────
// Returns { uri, mimeType } for the converted file, or null to signal "upload
// the original asset unchanged" (non-image media, or conversion failed).
async function maybeConvertToWebp(asset) {
  try {
    const rawExt = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
    const mime = (asset.mimeType || '').toLowerCase();

    const isVideo = asset.type === 'video' || mime.startsWith('video/') ||
      ['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(rawExt);
    const isAudio = mime.startsWith('audio/') ||
      ['m4a', 'mp3', 'wav', 'aac', 'caf'].includes(rawExt);
    const isGif = mime === 'image/gif' || rawExt === 'gif'; // animated — don't flatten
    const alreadyWebp = mime === 'image/webp' || rawExt === 'webp';

    if (isVideo || isAudio || isGif || alreadyWebp) return null;

    let ctx = ImageManipulator.manipulate(asset.uri);

    // Only downscale when the image is larger than the cap — never upscale.
    const w = asset.width;
    const h = asset.height;
    if (w && h && Math.max(w, h) > MAX_IMAGE_DIMENSION) {
      ctx = w >= h
        ? ctx.resize({ width: MAX_IMAGE_DIMENSION })
        : ctx.resize({ height: MAX_IMAGE_DIMENSION });
    }

    const rendered = await ctx.renderAsync();
    const result = await rendered.saveAsync({ compress: WEBP_QUALITY, format: SaveFormat.WEBP });

    return result?.uri ? { uri: result.uri, mimeType: 'image/webp' } : null;
  } catch (e) {
    console.warn('WebP conversion failed, uploading original:', e?.message);
    return null;
  }
}

// ── Permission helpers ────────────────────────────────────────────────────────
async function ensureMediaPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Please allow access to your photo library in Settings.');
    return false;
  }
  return true;
}

async function ensureCameraPermission() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Please allow camera access in Settings.');
    return false;
  }
  return true;
}

// ── Upload a local URI to Supabase Storage ────────────────────────────────────
async function uploadUri(userId, asset) {
  const converted = await maybeConvertToWebp(asset);
  const sourceUri = converted?.uri || asset.uri;

  // Determine file extension - use mimeType as fallback for recorded audio
  let ext;
  if (converted) {
    ext = 'webp';
  } else {
    const uriExt = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase();
    const mime = (asset.mimeType || '').toLowerCase();

    if (uriExt && ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'm4v', 'webm', 'avi', 'm4a', 'mp3', 'wav', 'aac', 'caf'].includes(uriExt)) {
      ext = uriExt;
    } else if (mime.startsWith('audio/')) {
      ext = 'm4a'; // Default for recorded audio (expo-av uses m4a)
    } else if (mime.startsWith('video/')) {
      ext = 'mp4';
    } else {
      ext = 'jpg'; // Default for images
    }
  }
  const filePath = `${userId}/${Date.now()}.${ext}`;

  try {
    const base64 = await readAsStringAsync(sourceUri, { encoding: EncodingType.Base64 });

    if (!base64) {
      Alert.alert('Upload failed', 'Image file was empty.');
      return null;
    }

    const fileBody = decode(base64);

    const contentType =
      converted?.mimeType ||
      asset.mimeType ||
      (ext === 'png' ? 'image/png' :
       ext === 'mp4' ? 'video/mp4' :
       ext === 'mov' ? 'video/quicktime' :
       ext === 'm4a' ? 'audio/mp4' :
       ext === 'mp3' ? 'audio/mpeg' :
       ext === 'wav' ? 'audio/wav' :
       ext === 'aac' ? 'audio/aac' :
       ext === 'caf' ? 'audio/x-caf' :
       'image/jpeg');

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, fileBody, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error.message);
      Alert.alert('Upload failed', error.message);
      return null;
    }

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (e) {
    console.error('File read error:', e.message);
    Alert.alert('Upload failed', 'Failed to read image file.');
    return null;
  }
}

// ── Pick from camera roll ─────────────────────────────────────────────────────
async function fromLibrary(userId) {
  if (!(await ensureMediaPermission())) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
    Alert.alert('File too large', 'Please select a file under 15MB.');
    return null;
  }

  if (result.canceled) return null;
  return uploadUri(userId, result.assets[0]);
}

// ── Snap with camera ──────────────────────────────────────────────────────────
async function fromCamera(userId) {
  if (!(await ensureCameraPermission())) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
    Alert.alert('File too large', 'Please select a file under 15MB.');
    return null;
  }

  if (result.canceled) return null;
  return uploadUri(userId, result.assets[0]);
}

// ── Pick only (local URI) — use for previews before upload ───────────────────
function pickAssetFromLibrary() {
  return (async () => {
    if (!(await ensureMediaPermission())) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
      Alert.alert('File too large', 'Please select a file under 15MB.');
      return null;
    }
    return asset;
  })();
}

function pickAssetFromCamera() {
  return (async () => {
    if (!(await ensureCameraPermission())) return null;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
      Alert.alert('File too large', 'Please select a file under 15MB.');
      return null;
    }
    return asset;
  })();
}

export function pickPhotoAsset() {
  return new Promise((resolve) => {
    Alert.alert(
      'Add photo',
      'Choose a source',
      [
        { text: 'Take photo', onPress: () => pickAssetFromCamera().then(resolve) },
        { text: 'Photo library', onPress: () => pickAssetFromLibrary().then(resolve) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]
    );
  });
}

export function uploadPhotoAsset(userId, asset) {
  if (!asset?.uri) return Promise.resolve(null);
  return uploadUri(userId, asset);
}

// ── Public: pick with camera/library choice (ActionSheet) ────────────────────
export function pickAndUploadPhoto(userId) {
  return new Promise((resolve) => {
    Alert.alert(
      'Add photo',
      'Choose a source',
      [
        {
          text: 'Take photo',
          onPress: () => fromCamera(userId).then(resolve),
        },
        {
          text: 'Photo library',
          onPress: () => fromLibrary(userId).then(resolve),
        },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]
    );
  });
}

// ── Delete a photo by its public URL ─────────────────────────────────────────
export async function deletePhoto(publicUrl) {
  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx    = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const filePath = publicUrl.slice(idx + marker.length);
    const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
    if (error) console.error('Delete error:', error.message);
  } catch (e) {
    console.error('deletePhoto error:', e);
  }
}

// ── Detect region via IP geolocation (continent / country) ───────────────────
export async function detectRegion() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res  = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(id);
    const data = await res.json();
    // Return continent or country (e.g. "Europe", "North America", "Nigeria")
    return data.continent_name || data.country_name || null;
  } catch {
    return null;
  }
}

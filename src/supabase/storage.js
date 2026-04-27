// supabase/storage.js — photo upload / delete helpers
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { Alert } from 'react-native';
import { supabase } from './client';

const BUCKET = 'photos';

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
  const ext = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const filePath = `${userId}/${Date.now()}.${ext}`;

  try {
    const file = new File(asset.uri);
    const base64 = await file.base64();

    if (!base64) {
      Alert.alert('Upload failed', 'Image file was empty.');
      return null;
    }

    const fileBody = decode(base64);

    const contentType =
      asset.mimeType ||
      (ext === 'png' ? 'image/png' : 'image/jpeg');

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
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  });

  if (result.canceled) return null;
  return uploadUri(userId, result.assets[0]);
}

// ── Snap with camera ──────────────────────────────────────────────────────────
async function fromCamera(userId) {
  if (!(await ensureCameraPermission())) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  });

  if (result.canceled) return null;
  return uploadUri(userId, result.assets[0]);
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
    const res  = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    // Return continent or country (e.g. "Europe", "North America", "Nigeria")
    return data.continent_name || data.country_name || null;
  } catch {
    return null;
  }
}

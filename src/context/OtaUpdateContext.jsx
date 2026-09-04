import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

const isWeb = Platform.OS === 'web';
const otaSupported = !__DEV__ && !isWeb;

const OtaUpdateContext = createContext({
  updateReady: false,
  checkComplete: true,
  isChecking: false,
  applyUpdate: async () => {},
  runOtaCheck: async () => false,
  updateMeta: null,
  lastError: null,
});

async function readUpdateMeta() {
  try {
    return {
      enabled: Updates.isEnabled,
      channel: Updates.channel ?? null,
      runtimeVersion: Updates.runtimeVersion ?? null,
      updateId: Updates.updateId ?? null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    };
  } catch {
    return { enabled: false, channel: null, runtimeVersion: null, updateId: null };
  }
}

export function OtaUpdateProvider({ children }) {
  const [updateReady, setUpdateReady] = useState(false);
  const [checkComplete, setCheckComplete] = useState(!otaSupported);
  const [isChecking, setIsChecking] = useState(false);
  const [updateMeta, setUpdateMeta] = useState(null);
  const [lastError, setLastError] = useState(null);
  const applyingRef = useRef(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    readUpdateMeta().then(setUpdateMeta);
  }, []);

  const runOtaCheck = useCallback(async () => {
    if (!otaSupported) {
      setCheckComplete(true);
      return false;
    }

    if (!Updates.isEnabled) {
      setLastError('OTA disabled — install the EAS-built APK, not Expo Go.');
      setCheckComplete(true);
      return false;
    }

    if (checkingRef.current) return false;
    checkingRef.current = true;
    setIsChecking(true);
    setLastError(null);

    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        return false;
      }

      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        setUpdateReady(true);
        return true;
      }
      return false;
    } catch (e) {
      setLastError(e?.message || 'OTA check failed');
      console.log('OTA check failed:', e?.message);
      return false;
    } finally {
      checkingRef.current = false;
      setIsChecking(false);
      setCheckComplete(true);
      readUpdateMeta().then(setUpdateMeta);
    }
  }, []);

  useEffect(() => {
    runOtaCheck();
  }, [runOtaCheck]);

  // Re-check when the app returns to the foreground.
  useEffect(() => {
    if (!otaSupported) return undefined;

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !updateReady) {
        runOtaCheck();
      }
    });

    return () => sub.remove();
  }, [runOtaCheck, updateReady]);

  const applyUpdate = useCallback(async () => {
    if (!updateReady || applyingRef.current) return;
    applyingRef.current = true;
    try {
      await Updates.reloadAsync();
    } catch (e) {
      applyingRef.current = false;
      setLastError(e?.message || 'OTA reload failed');
      console.log('OTA reload failed:', e?.message);
    }
  }, [updateReady]);

  // Auto-apply as soon as a download finishes (splash or in-app).
  useEffect(() => {
    if (updateReady && otaSupported) {
      applyUpdate();
    }
  }, [updateReady, applyUpdate]);

  return (
    <OtaUpdateContext.Provider
      value={{
        updateReady,
        checkComplete,
        isChecking,
        applyUpdate,
        runOtaCheck,
        updateMeta,
        lastError,
      }}
    >
      {children}
    </OtaUpdateContext.Provider>
  );
}

export function useOtaUpdate() {
  return useContext(OtaUpdateContext);
}

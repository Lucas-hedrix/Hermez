import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Appearance, Image } from 'react-native';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, shadow as baseShadow, accentPalettes, chatFonts, chatThemes } from './index';

const DEFAULT_CHAT_THEME = 'theme-2';

const ThemeContext = createContext();

// Prefetch all bundled chat theme images so they're cached before render.
// Bundled themes use require() results (numbers) → use Asset.fromModule().downloadAsync().
// Returns a promise that resolves when all downloads finish (or rejects silently).
function prefetchBundledThemes() {
  const modules = Object.values(chatThemes)
    .map((t) => t && t.uri)
    .filter((uri) => typeof uri === 'number'); // require() results are numbers
  return Promise.all(
    modules.map((module) => Asset.fromModule(module).downloadAsync().catch(() => {}))
  );
}

// Prefetch a single custom (user-uploaded) theme uri via Image.prefetch().
function prefetchCustomTheme(uri) {
  return Image.prefetch(uri).catch(() => {});
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [accentColor, setAccentColor] = useState('blue');
  const [chatFont, setChatFont] = useState('system');
  const [chatTheme, setChatTheme] = useState(DEFAULT_CHAT_THEME);

  useEffect(() => {
    // Load saved theme, accent color, or use system preference
    Promise.all([
      AsyncStorage.getItem('@cupid_theme'),
      AsyncStorage.getItem('@cupid_accent'),
      AsyncStorage.getItem('@cupid_chat_font'),
      AsyncStorage.getItem('@cupid_chat_theme'),
    ]).then(([savedTheme, savedAccent, savedFont, savedChatTheme]) => {
      if (savedTheme) {
        setIsDark(savedTheme === 'dark');
      } else {
        const colorScheme = Appearance.getColorScheme();
        setIsDark(colorScheme === 'dark');
      }

      if (savedAccent && accentPalettes[savedAccent]) {
        setAccentColor(savedAccent);
      }

      if (savedFont && chatFonts[savedFont]) {
        setChatFont(savedFont);
      }

      if (savedChatTheme) {
        setChatTheme(savedChatTheme);
        // Prefetch the stored custom theme immediately to avoid black flash
        if (savedChatTheme.startsWith('custom:')) {
          prefetchCustomTheme(savedChatTheme.slice('custom:'.length));
        }
      }
    });

    // Prefetch all bundled themes in the background on first app load
    prefetchBundledThemes();

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      AsyncStorage.getItem('@cupid_theme').then((saved) => {
        if (!saved) {
          setIsDark(colorScheme === 'dark');
        }
      });
    });

    return () => subscription.remove();
  }, []);

  const toggleTheme = (val) => {
    setIsDark(val);
    AsyncStorage.setItem('@cupid_theme', val ? 'dark' : 'light');
  };

  const changeAccentColor = (colorKey) => {
    if (accentPalettes[colorKey]) {
      setAccentColor(colorKey);
      AsyncStorage.setItem('@cupid_accent', colorKey);
    }
  };

  const changeChatFont = (fontKey) => {
    if (chatFonts[fontKey]) {
      setChatFont(fontKey);
      AsyncStorage.setItem('@cupid_chat_font', fontKey);
    }
  };

  const changeChatTheme = (themeKey) => {
    // Allow built-in themes or custom themes (prefixed with "custom:")
    if (chatThemes[themeKey] || themeKey.startsWith('custom:')) {
      setChatTheme(themeKey);
      AsyncStorage.setItem('@cupid_chat_theme', themeKey);

      // Prefetch a custom theme so it's cached before render
      if (themeKey.startsWith('custom:')) {
        prefetchCustomTheme(themeKey.slice('custom:'.length));
      }
    }
  };

  const baseColors = isDark ? darkColors : lightColors;
  const colors = useMemo(() => ({
    ...baseColors,
    ...accentPalettes[accentColor]
  }), [baseColors, accentColor]);

  // The active chat theme — either a bundled background image or a custom
  // user-uploaded uri stored as "custom:<uri>".
  // Memoized to prevent unnecessary recalculation on re-renders.
  const activeChatTheme = useMemo(() => {
    if (chatTheme && chatTheme.startsWith('custom:')) {
      const uri = chatTheme.slice('custom:'.length);
      // For custom themes, we use the local file URI directly
      return { type: 'custom', uri };
    }
    // For built-in themes, return the require() result which is bundled
    return chatThemes[chatTheme] || chatThemes[DEFAULT_CHAT_THEME];
  }, [chatTheme]);

  const shadow = useMemo(() => ({
    ...baseShadow,
    card: isDark ? {
      ...baseShadow.card,
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      shadowRadius: 10,
    } : baseShadow.card,
    glow: isDark ? {
      shadowColor: colors.ember,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 6,
    } : {},
  }), [isDark, colors.ember]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors, shadow, accentColor, changeAccentColor, chatFont, changeChatFont, chatTheme, activeChatTheme, changeChatTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback if not wrapped in provider (should not happen if App is wrapped)
    return { isDark: false, toggleTheme: () => {}, colors: lightColors, shadow: baseShadow, accentColor: 'pink', changeAccentColor: () => {}, chatFont: 'system', changeChatFont: () => {} };
  }
  return context;
}

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Appearance} from 'react-native';
import { Image } from 'expo-image';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, shadow as baseShadow, accentPalettes, chatFonts, chatThemes } from './index';

const DEFAULT_CHAT_THEME = 'theme-2';
const CUSTOM_CHAT_THEMES_KEY = '@cupid_chat_custom_themes';

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
  const [customChatThemes, setCustomChatThemes] = useState([]);

  useEffect(() => {
    // Load saved theme, accent color, or use system preference
    Promise.all([
      AsyncStorage.getItem('@cupid_theme'),
      AsyncStorage.getItem('@cupid_accent'),
      AsyncStorage.getItem('@cupid_chat_font'),
      AsyncStorage.getItem('@cupid_chat_theme'),
      AsyncStorage.getItem(CUSTOM_CHAT_THEMES_KEY),
    ]).then(([savedTheme, savedAccent, savedFont, savedChatTheme, savedCustomThemes]) => {
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

      if (savedCustomThemes) {
        try {
          const parsed = JSON.parse(savedCustomThemes);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((uri) => typeof uri === 'string' && uri.trim().length > 0);
            setCustomChatThemes(filtered);
            if (savedChatTheme?.startsWith('custom:') && !filtered.includes(savedChatTheme.slice('custom:'.length))) {
              prefetchCustomTheme(savedChatTheme.slice('custom:'.length));
            }
          }
        } catch (e) {
          console.log('[ThemeContext] custom themes parse error:', e.message);
        }
      }

      if (savedChatTheme) {
        setChatTheme(savedChatTheme);
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

  const addCustomChatTheme = async (uri) => {
    if (!uri || typeof uri !== 'string') return;

    const trimmed = uri.trim();
    if (!trimmed) return;

    setCustomChatThemes((current) => {
      const next = [trimmed, ...current.filter((item) => item !== trimmed)];
      AsyncStorage.setItem(CUSTOM_CHAT_THEMES_KEY, JSON.stringify(next));
      return next;
    });

    const themeKey = `custom:${trimmed}`;
    setChatTheme(themeKey);
    AsyncStorage.setItem('@cupid_chat_theme', themeKey);
    prefetchCustomTheme(trimmed);
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
      // For custom themes, return a source object compatible with Image/ImageBackground
      // ImageBackground expects { uri: '...' } for remote/local file URIs
      return { uri };
    }
    // For built-in themes, return the theme object which has the require() result in .uri
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
    <ThemeContext.Provider value={{
      isDark,
      toggleTheme,
      colors,
      shadow,
      accentColor,
      changeAccentColor,
      chatFont,
      changeChatFont,
      chatTheme,
      activeChatTheme,
      changeChatTheme,
      customChatThemes,
      addCustomChatTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback if not wrapped in provider (should not happen if App is wrapped)
    return {
      isDark: false,
      toggleTheme: () => {},
      colors: lightColors,
      shadow: baseShadow,
      accentColor: 'pink',
      changeAccentColor: () => {},
      chatFont: 'system',
      changeChatFont: () => {},
      chatTheme: DEFAULT_CHAT_THEME,
      activeChatTheme: chatThemes[DEFAULT_CHAT_THEME],
      changeChatTheme: () => {},
      customChatThemes: [],
      addCustomChatTheme: () => {},
    };
  }
  return context;
}

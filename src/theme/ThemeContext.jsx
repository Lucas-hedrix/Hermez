import { createContext, useContext, useState, useEffect } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, shadow as baseShadow } from './index';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Load saved theme or use system preference
    AsyncStorage.getItem('@cupid_theme').then((saved) => {
      if (saved) {
        setIsDark(saved === 'dark');
      } else {
        const colorScheme = Appearance.getColorScheme();
        setIsDark(colorScheme === 'dark');
      }
    });

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

  const colors = isDark ? darkColors : lightColors;

  const shadow = {
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
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors, shadow }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback if not wrapped in provider (should not happen if App is wrapped)
    return { isDark: false, toggleTheme: () => {}, colors: lightColors, shadow: baseShadow };
  }
  return context;
}

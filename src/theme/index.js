export const darkColors = {
  // Brand
  ember: '#FF4D6D',
  emberLight: 'rgba(255, 77, 109, 0.15)',
  emberDark: '#B33320',
  gold: '#F9C22E',
  goldLight: 'rgba(249, 194, 46, 0.15)',

  // Vibe Colors
  vibeGaming: '#7B61FF',
  vibeDating: '#FF4D6D',
  vibeStudy: '#F9C22E',
  vibeFriendship: '#20C997',
  vibeChat: '#00F0FF',
  vibeHangout: '#FF9F1C',

  // Neutrals (Velvet Glow)
  ink: '#FFFFFF',
  graphite: '#E0E0E0',
  stone: '#A0A0A0',
  ash: '#6B6565',
  fog: '#1F1F24',
  snow: '#070709', // Velvet black background
  white: '#131317', // Glass/Card backgrounds

  // Semantic
  success: '#20C997',
  danger: '#FF4D6D',
};

export const lightColors = {
  ...darkColors,
  ink: '#131317',
  graphite: '#4A4A4A',
  stone: '#808080',
  ash: '#A0A0A0',
  fog: '#E0E0E0',
  snow: '#FFFFFF',
  white: '#F5F5F7',
};

// Available accent colors
export const accentPalettes = {
  pink: { ember: '#FF4D6D', emberLight: 'rgba(255, 77, 109, 0.15)', emberDark: '#B33320' },
  purple: { ember: '#9B51E0', emberLight: 'rgba(155, 81, 224, 0.15)', emberDark: '#562A80' },
  blue: { ember: '#2F80ED', emberLight: 'rgba(47, 128, 237, 0.15)', emberDark: '#1A4D94' },
  green: { ember: '#27AE60', emberLight: 'rgba(39, 174, 96, 0.15)', emberDark: '#166E3A' },
  orange: { ember: '#F2994A', emberLight: 'rgba(242, 153, 74, 0.15)', emberDark: '#A86125' },
};

export const fonts = {
  display: 'serif',       // swap for 'Cormorant_Garamond' with expo-google-fonts
  body: 'System',         // swap for 'DM_Sans'
};

// 10 selectable chat fonts — { key: { label, ios, android } }
export const chatFonts = {
  system:    { label: 'System',       ios: 'System',            android: 'sans-serif' },
  georgia:   { label: 'Georgia',      ios: 'Georgia',           android: 'serif' },
  courier:   { label: 'Courier',      ios: 'Courier New',       android: 'monospace' },
  helvetica: { label: 'Helvetica',    ios: 'Helvetica Neue',    android: 'sans-serif' },
  times:     { label: 'Times',        ios: 'Times New Roman',   android: 'serif' },
  palatino:  { label: 'Palatino',     ios: 'Palatino',          android: 'serif' },
  avenir:    { label: 'Avenir',       ios: 'Avenir-Book',       android: 'sans-serif-medium' },
  menlo:     { label: 'Menlo',        ios: 'Menlo',             android: 'monospace' },
  gill:      { label: 'Gill Sans',    ios: 'Gill Sans',         android: 'sans-serif-light' },
  didot:     { label: 'Didot',        ios: 'Didot',             android: 'serif' },
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  glow: {
    shadowColor: '#FF4D6D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 8,
  },
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 40,
};

// Bundled chat background themes — theme-2 is the default.
// For custom user-uploaded themes, the uri is stored as "custom:<uri>"
// and resolved at runtime in ThemeContext.
export const chatThemes = {
  'theme-1': { label: 'Theme 1', uri: require('../../Themes/theme-1.jpg') },
  'theme-2': { label: 'Theme 2', uri: require('../../Themes/theme-2.jpg') },
  'theme-3': { label: 'Theme 3', uri: require('../../Themes/theme-3.jpg') },
};

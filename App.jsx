// App.jsx — entry point
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <AppNavigator />
    </ThemeProvider>
  );
}

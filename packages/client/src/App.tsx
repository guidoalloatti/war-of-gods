import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useGameStore } from './stores/gameStore.js';
import { useAuth } from './stores/authStore.js';
import { LandingScreen } from './screens/LandingScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { RegisterScreen } from './screens/RegisterScreen.js';
import { MenuScreen } from './screens/MenuScreen.js';
import { RaceSelectionScreen } from './screens/RaceSelectionScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { Era1Screen } from './screens/Era1Screen.js';
import { ScoringScreen } from './screens/ScoringScreen.js';
import { AdminLayout } from './screens/admin/AdminLayout.js';
import { SettingsSidebar } from './components/SettingsSidebar.js';
import { useI18n } from './i18n/index.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-game-bg flex items-center justify-center p-8">
          <div className="bg-game-surface border border-red-500/30 rounded-xl p-8 max-w-md text-center">
            <h1 className="text-xl font-bold text-red-400 mb-3">Something went wrong</h1>
            <p className="text-text-secondary text-sm mb-4">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="bg-game-gold text-game-bg font-bold px-6 py-2 rounded-lg hover:brightness-110 transition-all"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type AuthScreen = 'landing' | 'login' | 'register';

function CurrentScreen() {
  const screen = useGameStore(s => s.screen);
  const user = useAuth(s => s.user);
  const authLoading = useAuth(s => s.loading);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('landing');
  const [skippedAuth, setSkippedAuth] = useState(false);

  // When user logs in, go to game
  // When on menu screen and not logged in and not skipped: show auth flow
  if (screen === 'menu' && !user && !authLoading && !skippedAuth) {
    switch (authScreen) {
      case 'login':
        return (
          <LoginScreen
            onRegister={() => setAuthScreen('register')}
            onSkip={() => setSkippedAuth(true)}
          />
        );
      case 'register':
        return (
          <RegisterScreen
            onLogin={() => setAuthScreen('login')}
            onSkip={() => setSkippedAuth(true)}
          />
        );
      default:
        return (
          <LandingScreen
            onSkip={() => setSkippedAuth(true)}
            onLogin={() => setAuthScreen('login')}
            onRegister={() => setAuthScreen('register')}
          />
        );
    }
  }

  switch (screen) {
    case 'menu':
      return <MenuScreen />;
    case 'race_selection':
      return <RaceSelectionScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'era1':
      return <Era1Screen />;
    case 'scoring':
      return <ScoringScreen />;
    case 'admin':
      return <AdminLayout />;
  }
}

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useI18n(s => s.t);
  const restoreSession = useAuth(s => s.restoreSession);
  const attemptReconnect = useGameStore(s => s.attemptReconnect);

  useEffect(() => {
    restoreSession();
    // Attempt to reconnect to a multiplayer room if we have stored credentials
    attemptReconnect();
  }, [restoreSession, attemptReconnect]);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ErrorBoundary>
        {/* Settings gear button — fixed top-left */}
        <button
          id="settings-button"
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="fixed top-3 left-3 z-[80] w-10 h-10 flex items-center justify-center rounded-full bg-game-surface/80 border border-border-medium hover:border-game-gold text-text-secondary hover:text-text-primary transition-colors"
          aria-label={t.settings.openSettings}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <CurrentScreen />

        <SettingsSidebar
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </ErrorBoundary>
    </GoogleOAuthProvider>
  );
}

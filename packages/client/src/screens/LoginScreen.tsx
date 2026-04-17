import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../stores/authStore.js';
import { useI18n } from '../i18n/index.js';

type Props = {
  onRegister: () => void;
  onSkip: () => void;
};

export function LoginScreen({ onRegister, onSkip }: Props) {
  const t = useI18n(s => s.t);
  const login = useAuth(s => s.login);
  const loginWithEmail = useAuth(s => s.loginWithEmail);
  const authError = useAuth(s => s.error);
  const clearError = useAuth(s => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch {
      // error is set in store
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="login-screen" className="min-h-screen bg-game-bg bg-radial-theme flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-radial-gold pointer-events-none opacity-40" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold via-game-gold to-game-gold-dark uppercase tracking-tight">
            {t.app.title}
          </h1>
          <h2 className="text-lg font-bold text-text-primary mt-3">{t.auth.loginTitle}</h2>
          <p className="text-text-muted text-sm mt-1">{t.auth.loginSubtitle}</p>
        </div>

        {/* Google login */}
        <div className="flex justify-center mb-4">
          <div className="bg-game-surface/80 backdrop-blur-sm border border-border-subtle rounded-xl p-2.5">
            <GoogleLogin
              onSuccess={async (response) => {
                if (response.credential) {
                  try { await login(response.credential); } catch { /* */ }
                }
              }}
              onError={() => {}}
              size="large"
              theme="filled_black"
              shape="pill"
              text="signin_with"
            />
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-text-faint text-xs uppercase tracking-wider">{t.auth.orDivider}</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-primary text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              {t.auth.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearError(); }}
              className="w-full bg-game-surface text-white rounded-lg px-3 py-2.5 border border-border-medium focus:border-game-gold/50 focus:outline-none focus:shadow-gold-sm transition-all text-sm"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-text-primary text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              {t.auth.password}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); clearError(); }}
              className="w-full bg-game-surface text-white rounded-lg px-3 py-2.5 border border-border-medium focus:border-game-gold/50 focus:outline-none focus:shadow-gold-sm transition-all text-sm"
              autoComplete="current-password"
            />
          </div>

          {authError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full relative overflow-hidden bg-gradient-to-r from-game-accent to-game-ember text-white font-bold py-2.5 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-0.5 transition-all shadow-accent disabled:opacity-50 disabled:translate-y-0"
          >
            <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            <span className="relative">{submitting ? '...' : t.auth.login}</span>
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-text-muted text-sm">
            {t.auth.noAccount}{' '}
            <button
              type="button"
              onClick={onRegister}
              className="text-game-gold hover:text-game-gold/80 font-semibold transition-colors"
            >
              {t.auth.register}
            </button>
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="text-text-faint hover:text-text-muted text-xs transition-colors"
          >
            {t.auth.playAsGuest}
          </button>
        </div>
      </div>
    </div>
  );
}

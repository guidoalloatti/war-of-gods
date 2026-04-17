import { useState } from 'react';
import { useAuth } from '../stores/authStore.js';
import { useI18n } from '../i18n/index.js';

type Props = {
  onLogin: () => void;
  onSkip: () => void;
};

export function RegisterScreen({ onLogin, onSkip }: Props) {
  const t = useI18n(s => s.t);
  const register = useAuth(s => s.register);
  const authError = useAuth(s => s.error);
  const clearError = useAuth(s => s.clearError);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError('');

    if (!name || !email || !password) return;

    if (password.length < 6) {
      setLocalError(t.auth.passwordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setLocalError(t.auth.passwordMismatch);
      return;
    }

    setSubmitting(true);
    try {
      await register(name, email, password);
    } catch {
      // error is set in store
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError || authError;

  return (
    <div id="register-screen" className="min-h-screen bg-game-bg bg-radial-theme flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-radial-gold pointer-events-none opacity-40" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold via-game-gold to-game-gold-dark uppercase tracking-tight">
            {t.app.title}
          </h1>
          <h2 className="text-lg font-bold text-text-primary mt-3">{t.auth.registerTitle}</h2>
          <p className="text-text-muted text-sm mt-1">{t.auth.registerSubtitle}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-primary text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              {t.auth.name}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); clearError(); setLocalError(''); }}
              className="w-full bg-game-surface text-white rounded-lg px-3 py-2.5 border border-border-medium focus:border-game-gold/50 focus:outline-none focus:shadow-gold-sm transition-all text-sm"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-text-primary text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              {t.auth.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearError(); setLocalError(''); }}
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
              onChange={e => { setPassword(e.target.value); clearError(); setLocalError(''); }}
              className="w-full bg-game-surface text-white rounded-lg px-3 py-2.5 border border-border-medium focus:border-game-gold/50 focus:outline-none focus:shadow-gold-sm transition-all text-sm"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-text-primary text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              {t.auth.confirmPassword}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setLocalError(''); }}
              className="w-full bg-game-surface text-white rounded-lg px-3 py-2.5 border border-border-medium focus:border-game-gold/50 focus:outline-none focus:shadow-gold-sm transition-all text-sm"
              autoComplete="new-password"
            />
          </div>

          {displayError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2">
              {displayError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !name || !email || !password || !confirmPassword}
            className="w-full relative overflow-hidden bg-gradient-to-r from-game-accent to-game-ember text-white font-bold py-2.5 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-0.5 transition-all shadow-accent disabled:opacity-50 disabled:translate-y-0"
          >
            <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            <span className="relative">{submitting ? '...' : t.auth.register}</span>
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-text-muted text-sm">
            {t.auth.hasAccount}{' '}
            <button
              type="button"
              onClick={onLogin}
              className="text-game-gold hover:text-game-gold/80 font-semibold transition-colors"
            >
              {t.auth.login}
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

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Cinzel', 'Georgia', 'serif'],
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        'game-bg': 'var(--game-bg)',
        'game-bg-alt': 'var(--game-bg-alt)',
        'game-surface': 'var(--game-surface)',
        'game-surface-light': 'var(--game-surface-light)',
        'game-accent': '#e94560',
        'game-gold': '#f5c518',
        'game-gold-dark': '#c9a000',
        'game-ember': '#ff6b35',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        'border-subtle': 'var(--border-subtle)',
        'border-medium': 'var(--border-medium)',
        'error-bg': 'var(--error-bg)',
        'error-text': 'var(--error-text)',
        'hover-bg': 'var(--hover-bg)',
        'overlay-bg': 'var(--overlay-bg)',
      },
      backgroundImage: {
        'radial-theme': 'radial-gradient(ellipse at center, var(--radial-center) 0%, var(--radial-edge) 70%)',
        'radial-gold': 'radial-gradient(ellipse at center, var(--gold-glow) 0%, transparent 70%)',
      },
      boxShadow: {
        'gold-sm': 'var(--shadow-gold-sm)',
        'gold-md': 'var(--shadow-gold-md)',
        'gold-lg': '0 0 30px rgba(245,197,24,0.3), 0 0 60px rgba(245,197,24,0.15)',
        'accent': 'var(--shadow-accent)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      keyframes: {
        'float-1': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)', opacity: '0.3' },
          '50%': { transform: 'translateY(-30px) translateX(10px)', opacity: '0.6' },
        },
        'float-2': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)', opacity: '0.2' },
          '33%': { transform: 'translateY(-20px) translateX(-15px)', opacity: '0.5' },
          '66%': { transform: 'translateY(-40px) translateX(5px)', opacity: '0.3' },
        },
        'float-3': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)', opacity: '0.25' },
          '25%': { transform: 'translateY(-15px) translateX(20px)', opacity: '0.5' },
          '75%': { transform: 'translateY(-35px) translateX(-10px)', opacity: '0.15' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'hex-glow': {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.3)' },
        },
      },
      animation: {
        'float-1': 'float-1 8s ease-in-out infinite',
        'float-2': 'float-2 12s ease-in-out infinite',
        'float-3': 'float-3 10s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'hex-glow': 'hex-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

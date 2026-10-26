/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian:  { DEFAULT: '#0A0A0F', 800: '#12121A', 700: '#1A1A26', 600: '#222233' },
        electric:  { DEFAULT: '#00D4FF', dim: '#00D4FF33', glow: '#00D4FF66' },
        gold:      { DEFAULT: '#FFD700', dim: '#FFD70033', glow: '#FFD70066' },
        permit:    '#00FF88',
        deny:      '#FF3366',
        escalate:  '#FFB800',
      },
      fontFamily: {
        mono:    ['"JetBrains Mono"', 'monospace'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'electric': '0 0 20px #00D4FF66, 0 0 40px #00D4FF33',
        'gold':     '0 0 30px #FFD70066, 0 0 60px #FFD70033',
        'deny':     '0 0 20px #FF336666',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'spin-slow':  'spin 20s linear infinite',
        'glow-pulse': 'glowPulse 1.5s ease-in-out infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px #00D4FF33' },
          '50%':       { boxShadow: '0 0 20px #00D4FF66, 0 0 40px #00D4FF33' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

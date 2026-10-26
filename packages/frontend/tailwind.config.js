/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#05050A',
          900: '#0A0A0F',
          800: '#0F0F1A',
          700: '#151523',
          600: '#1C1C2E',
          500: '#252538',
        },
        electric: {
          50: '#E6FBFF',
          100: '#B3F4FF',
          200: '#66EAFF',
          300: '#33E2FF',
          400: '#00D4FF',
          500: '#00BFED',
          600: '#009FC7',
          700: '#007FA0',
          800: '#005F78',
        },
        golden: {
          50: '#FFFDE6',
          100: '#FFF9B3',
          200: '#FFF066',
          300: '#FFE71A',
          400: '#FFD700',
          500: '#E6C200',
          600: '#C2A300',
          700: '#9E8500',
        },
        ruby: {
          400: '#FF4D6D',
          500: '#E63950',
          600: '#CC2040',
        },
        emerald: {
          400: '#00FF88',
          500: '#00E67A',
          600: '#00CC6B',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        'spin-reverse': 'spin-reverse 12s linear infinite',
        'orbit': 'orbit 6s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 4s ease-in-out infinite',
        'scan': 'scan 3s linear infinite',
      },
      keyframes: {
        'spin-reverse': { '0%': { transform: 'rotate(360deg)' }, '100%': { transform: 'rotate(0deg)' } },
        'glow': {
          '0%': { boxShadow: '0 0 5px #00D4FF, 0 0 10px #00D4FF' },
          '100%': { boxShadow: '0 0 10px #00D4FF, 0 0 30px #00D4FF, 0 0 50px #00D4FF' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      boxShadow: {
        'electric': '0 0 10px #00D4FF44, 0 0 20px #00D4FF22',
        'golden': '0 0 10px #FFD70044, 0 0 20px #FFD70022',
        'ruby': '0 0 10px #FF4D6D44, 0 0 20px #FF4D6D22',
        'emerald': '0 0 10px #00FF8844, 0 0 20px #00FF8822',
        'glow-electric': '0 0 20px #00D4FF88, 0 0 40px #00D4FF44, 0 0 80px #00D4FF22',
        'glow-golden': '0 0 20px #FFD70088, 0 0 40px #FFD70044',
      },
    },
  },
  plugins: [],
};

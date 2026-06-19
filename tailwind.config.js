/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e0eaff',
          200: '#b8d4ff',
          300: '#85baff',
          400: '#4d9dff',
          500: '#0071e3',
          600: '#0077ed',
          700: '#005bb5',
          800: '#004a93',
          900: '#003768',
        },
        'apple-bg': '#f5f5f7',
        'apple-text': '#1d1d1f',
        'apple-secondary': 'rgba(134, 134, 139, <alpha-value>)',
        'apple-border': 'rgba(210, 210, 215, <alpha-value>)',
        profit: 'rgba(226, 61, 48, <alpha-value>)',
        loss: 'rgba(52, 199, 89, <alpha-value>)',
        'fixed-income': '#af52de',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      borderRadius: {
        'apple': '12px',
        'apple-lg': '18px',
        'apple-xl': '22px',
      },
      boxShadow: {
        'apple': '0 2px 12px rgba(0, 0, 0, 0.08)',
        'apple-lg': '0 4px 24px rgba(0, 0, 0, 0.12)',
        'apple-xl': '0 8px 40px rgba(0, 0, 0, 0.16)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

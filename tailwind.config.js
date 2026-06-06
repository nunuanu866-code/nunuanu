/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: '#C9A84C', light: '#F5E9C8', dark: '#8A6A1A' },
        nunu: { DEFAULT: '#1A1A2E', 50: '#F5F5F8' }
      },
      fontFamily: { sans: ['Pretendard', '-apple-system', 'sans-serif'] }
    }
  },
  plugins: []
}

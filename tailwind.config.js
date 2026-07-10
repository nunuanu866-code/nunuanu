/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        nunu: {
          DEFAULT: '#0066cc',
          50: '#f5f5f7',
          100: '#fafafc',
          200: '#e0e0e0',
          700: '#0071e3',
          ink: '#1d1d1f'
        },
        gold: { DEFAULT: '#0066cc', light: '#f5f5f7', dark: '#0071e3' },
        cream: { DEFAULT: '#f5f5f7', light: '#fafafc', deep: '#e0e0e0' },
        ink: { DEFAULT: '#1d1d1f', tint: '#333333' },
        apple: {
          blue: '#0066cc',
          focus: '#0071e3',
          darkBlue: '#2997ff',
          ink: '#1d1d1f',
          muted: '#7a7a7a',
          parchment: '#f5f5f7',
          pearl: '#fafafc',
          tile: '#272729',
          tile2: '#2a2a2c',
          tile3: '#252527',
          black: '#000000',
          hairline: '#e0e0e0'
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'Pretendard', 'sans-serif'],
        display: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'Pretendard', 'sans-serif']
      },
      borderRadius: {
        xl: '11px',
        '2xl': '18px',
        '3xl': '24px'
      },
      boxShadow: {
        soft: 'none',
        modal: '0 24px 60px rgba(0,0,0,.18)',
        product: '3px 5px 30px rgba(0,0,0,.22)'
      }
    }
  },
  plugins: []
}

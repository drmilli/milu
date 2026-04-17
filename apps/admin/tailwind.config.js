/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#5C3D2E',
        'primary-dark': '#3B2314',
        'primary-warm': '#7A5230',
        cream: '#F5ECD7',
        'cream-light': '#FAF6EE',
        'cream-dark': '#EAD9BA',
        success: '#4A7C59',
        warning: '#C97D2E',
        danger: '#A63C2E',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        heading: ['var(--font-playfair)', 'serif'],
      },
    },
  },
  plugins: [],
};

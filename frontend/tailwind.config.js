/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f7f3ea',
        paper: '#fffdf8',
        night: '#24170d',
        ink: '#302416',
        muted: '#6d6252',
        accent: '#875921',
        bronze: '#875921',
        gold: '#c7a85c',
        'gold-pale': '#ead79b',
        success: '#4f6041',
        danger: '#923d2b',
        line: '#d8cdb9',
        sage: '#745b36',
        sand: '#ece4d5',
        cream: '#f7f3ea',
        clay: '#875921'
      },
      fontFamily: {
        display: ['"Outfit Variable"', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader Variable"', 'Georgia', 'serif'],
        sans: ['"Outfit Variable"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        lift: '0 28px 90px -42px rgba(67, 43, 17, 0.42)',
        card: '0 18px 50px -36px rgba(67, 43, 17, 0.34)',
        gold: '0 24px 70px -36px rgba(135, 89, 33, 0.52)'
      }
    }
  },
  plugins: []
};

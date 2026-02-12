/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#E6F2FF',
          100: '#CCE5FF',
          200: '#99CBFF',
          300: '#66B1FF',
          400: '#3397FF',
          500: '#007BFF',
          600: '#007BFF',
          700: '#0066CC',
          800: '#0052A3',
          900: '#003D7A',
        },
      },
      fontFamily: {
        poppins: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Typography system fonts
        // SF Pro Rounded is system font on macOS/iOS, fallback to system rounded fonts
        'headline': ['"SF Pro Rounded"', '"SF Pro Rounded Semibold"', 'ui-rounded', 'system-ui', 'sans-serif'],
        // Use CSS variable for Inter (loaded via Next.js font optimization)
        // The CSS variable resolves to the Next.js-generated class name (e.g., __Inter_f367f3)
        'body': ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        'ui': ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        // Override Tailwind's default sans font to use Inter
        'sans': ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        // Landing page specific fonts
        'sf-rounded': ['"SF Pro Rounded"', '-apple-system', 'system-ui', 'sans-serif'],
        'inter': ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

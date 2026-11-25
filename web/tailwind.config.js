const v = (n) => `hsl(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', '"Segoe UI"', 'Tahoma', 'system-ui', 'sans-serif'] },
      colors: {
        background: v('background'), foreground: v('foreground'), card: v('card'),
        muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
        border: v('border'), input: v('border'), ring: v('ring'),
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        brand: { DEFAULT: v('brand'), soft: v('brand-soft') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        sidebar: v('sidebar'),
      },
      fontSize: { xs: ['0.875rem', '1.25rem'], sm: ['0.9375rem', '1.375rem'] },
      borderRadius: { lg: '10px', md: '8px', sm: '6px' },
      boxShadow: { card: '0 1px 2px 0 rgb(0 0 0 / 0.04)', pop: '0 16px 48px -12px rgb(0 0 0 / 0.25)' },
      keyframes: { in: { from: { opacity: 0, transform: 'translateY(6px) scale(.98)' } }, fade: { from: { opacity: 0 } } },
      animation: { in: 'in .16s ease-out', fade: 'fade .15s ease-out' },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.25rem', md: '2rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        // Making Software accents
        ink: 'hsl(var(--ink) / <alpha-value>)',
        electric: 'hsl(var(--electric) / <alpha-value>)',
        'electric-soft': 'hsl(var(--electric-soft) / <alpha-value>)',
        'electric-pale': 'hsl(var(--electric-pale) / <alpha-value>)',
        hairline: 'hsl(var(--hairline) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        reading: ['var(--font-reading)', 'Georgia', 'Cambria', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ["'Departure Mono'", 'var(--font-mono)', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 1px)',
        sm: 'calc(var(--radius) - 2px)',
      },
      boxShadow: {
        crisp: '0 1px 0 0 hsl(var(--hairline))',
        lift: '0 1px 2px -1px hsl(var(--ink) / 0.08), 0 8px 24px -18px hsl(var(--electric) / 0.35)',
      },
      backgroundImage: {
        'blueprint-grid':
          'linear-gradient(to right, hsl(var(--hairline)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--hairline)) 1px, transparent 1px)',
        'blueprint-dots': 'radial-gradient(hsl(var(--hairline)) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '32px 32px',
        'grid-sm': '16px 16px',
        dots: '20px 20px',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        dash: { to: { 'stroke-dashoffset': '-1000' } },
        'dash-slow': { to: { 'stroke-dashoffset': '-2000' } },
        'node-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(1.12)' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'draw-line': { from: { 'stroke-dashoffset': 'var(--dash-len, 400)' }, to: { 'stroke-dashoffset': '0' } },
        'scan-y': { from: { transform: 'translateY(-8%)' }, to: { transform: 'translateY(108%)' } },
        'ticker': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        dash: 'dash 22s linear infinite',
        'dash-slow': 'dash-slow 42s linear infinite',
        'node-pulse': 'node-pulse 2.4s ease-in-out infinite',
        'rise-in': 'rise-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'draw-line': 'draw-line 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scan-y': 'scan-y 6s linear infinite',
        ticker: 'ticker 32s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
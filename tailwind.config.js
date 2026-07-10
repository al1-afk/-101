/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Tailwind semantic tokens (CSS variable–driven, for shadcn compatibility)
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

        // ── Semantic color palette (spec-driven) ──
        // Each has: bg (surface), border, text (foreground), muted (accent shade)
        sem: {
          success: {
            bg:     '#EAF3DE',
            border: '#97C459',
            text:   '#27500A',
            muted:  '#639922',
          },
          warning: {
            bg:     '#FAEEDA',
            border: '#FAC775',
            text:   '#633806',
            muted:  '#BA7517',
          },
          danger: {
            bg:     '#FCEBEB',
            border: '#F09595',
            text:   '#A32D2D',
            muted:  '#E24B4A',
          },
          info: {
            bg:     '#E6F1FB',
            border: '#85B7EB',
            text:   '#0C447C',
            muted:  '#378ADD',
          },
          neutral: {
            bg:     '#F1EFE8',
            border: '#B4B2A9',
            text:   '#5F5E5A',
            muted:  '#888780',
          },
          ai: {
            bg:     '#EEEDFE',
            border: '#A79FF4',
            text:   '#3C3489',
            muted:  '#6B63D4',
          },
        },

        // ── App primary (spec: #3a526b) ──
        'app-primary': {
          DEFAULT: '#3a526b',
          hover:   '#2d4156',
          light:   '#4a6d8c',
        },
        'app-accent': '#378ADD',

        // ── Sidebar ──
        'sidebar': {
          bg:      '#F8F9FA',
          border:  '#E2E8F0',
          item:    '#444441',
          muted:   '#5F5E5A',
          hover:   '#F1F5F9',
          'active-bg':     '#E6F1FB',
          'active-text':   '#0C447C',
          'active-border': '#378ADD',
        },

        // ── NEXT GITAL brand palette (2026) ──
        navy: {
          50:  '#F1F5FB',
          100: '#E1EAF7',
          200: '#B6C6E0',
          300: '#8EA8CE',
          400: '#4E6E9E',
          500: '#1E3A6E',
          600: '#152D5A',
          700: '#0F1E36',
          800: '#0A1628',
          900: '#05101F',
          950: '#020814',
        },
        electric: {
          DEFAULT: '#2563EB',
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        cyan: {
          50:  '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
          950: '#083344',
        },
        // Backwards-compat alias
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        dark: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        // Spec typography scale
        'label': ['11px', { fontWeight: '500', letterSpacing: '0.07em', lineHeight: '1' }],
        'table-header': ['11px', { fontWeight: '600', letterSpacing: '0.06em', lineHeight: '1' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: 'calc(400px + 100%) 0' },
        },
        'count-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'blob': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(40px, -60px) scale(1.1)' },
          '66%':      { transform: 'translate(-30px, 30px) scale(0.95)' },
        },
        'gradient-pan': {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'marquee': {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'spotlight': {
          '0%':   { opacity: '0', transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -40%) scale(1)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-14px)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':   'fade-in 0.3s ease-out',
        'slide-in':  'slide-in 0.3s ease-out',
        shimmer:     'shimmer 1.6s infinite linear',
        'count-in':  'count-in 0.4s ease-out',
        'blob':          'blob 14s ease-in-out infinite',
        'gradient-pan':  'gradient-pan 8s ease infinite',
        'marquee':       'marquee 28s linear infinite',
        'spotlight':     'spotlight 2s ease .75s 1 forwards',
        'float-slow':    'float-slow 6s ease-in-out infinite',
      },
      boxShadow: {
        'card-hover': '0 4px 24px rgba(0,0,0,0.08)',
        'card-dark-hover': '0 4px 24px rgba(0,0,0,0.35)',
        'header': '0 1px 0 rgba(15,30,54,0.06)',
        'header-dark': '0 1px 0 rgba(255,255,255,0.06)',
        'premium-sm': '0 1px 3px rgba(10,22,40,0.05), 0 1px 2px rgba(10,22,40,0.03)',
        'premium':    '0 6px 24px -8px rgba(10,22,40,0.10), 0 2px 6px -2px rgba(10,22,40,0.04)',
        'premium-lg': '0 20px 48px -16px rgba(10,22,40,0.14), 0 6px 12px -6px rgba(10,22,40,0.06)',
        'glow-blue':  '0 12px 32px -8px rgba(37,99,235,0.35)',
        'glow-cyan':  '0 12px 32px -8px rgba(6,182,212,0.30)',
      },
      backgroundImage: {
        'gradient-primary':      'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
        'gradient-primary-r':    'linear-gradient(90deg,  #2563EB 0%, #06B6D4 100%)',
        'gradient-primary-soft': 'linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(6,182,212,0.10) 100%)',
        'gradient-hero':         'linear-gradient(135deg, #0A1628 0%, #1E3A8A 50%, #06B6D4 100%)',
        'gradient-mesh':
          'radial-gradient(at 20% 15%, rgba(37,99,235,0.14) 0px, transparent 55%), radial-gradient(at 85% 10%, rgba(6,182,212,0.12) 0px, transparent 50%), radial-gradient(at 65% 95%, rgba(37,99,235,0.08) 0px, transparent 55%)',
      },
    },
  },
  plugins: [
    // 'light:' variant — mirrors Tailwind's 'dark:' pattern for the .light class
    function({ addVariant }) {
      addVariant('light', '.light &')
    },
  ],
}

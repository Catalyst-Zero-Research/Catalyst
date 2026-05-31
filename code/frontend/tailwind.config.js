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
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        bg: 'var(--cat-bg)',
        surface: {
          0: 'var(--cat-surface-1)',
          1: 'var(--cat-surface-1)',
          2: 'var(--cat-surface-2)',
          3: 'var(--cat-surface-3)',
        },
        cat: {
          border: 'var(--cat-border)',
          'border-subtle': 'var(--cat-border-subtle)',
          text1: 'var(--cat-text-1)',
          text2: 'var(--cat-text-2)',
          text3: 'var(--cat-text-3)',
          text4: 'var(--cat-text-4)',
          accent: 'var(--cat-accent)',
          'accent-hover': 'var(--cat-accent-hover)',
          'accent-muted': 'var(--cat-accent-muted)',
          success: 'var(--cat-success)',
          warning: 'var(--cat-warning)',
          danger: 'var(--cat-danger)',
          info: 'var(--cat-info)',
          material: 'var(--cat-material)',
          element: 'var(--cat-element)',
          cluster: 'var(--cat-cluster)',
        },

        // Legacy aliases retained so existing classes keep compiling
        base: 'var(--cat-bg)',
        text: {
          primary: 'var(--cat-text-1)',
          secondary: 'var(--cat-text-2)',
          tertiary: 'var(--cat-text-3)',
          quaternary: 'var(--cat-text-4)',
        },
        border: {
          DEFAULT: 'var(--cat-border)',
          default: 'var(--cat-border)',
          subtle: 'var(--cat-border-subtle)',
        },
        accent: {
          DEFAULT: 'var(--cat-accent)',
          hover: 'var(--cat-accent-hover)',
          muted: 'var(--cat-accent-muted)',
          subtle: 'var(--cat-accent-subtle)',
          foreground: 'hsl(var(--ui-accent-foreground))',
        },
        status: {
          success: 'var(--cat-success)',
          warning: 'var(--cat-warning)',
          error: 'var(--cat-danger)',
          info: 'var(--cat-info)',
        },
        node: {
          material: 'var(--cat-material)',
          element: 'var(--cat-element)',
          cluster: 'var(--cat-cluster)',
        },

        // Shadcn compatibility (namespaced ui channels)
        input: 'hsl(var(--ui-input))',
        ring: 'hsl(var(--ui-ring))',
        background: 'hsl(var(--ui-background))',
        foreground: 'hsl(var(--ui-foreground))',
        primary: {
          DEFAULT: 'hsl(var(--ui-primary))',
          foreground: 'hsl(var(--ui-primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--ui-secondary))',
          foreground: 'hsl(var(--ui-secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--ui-destructive))',
          foreground: 'hsl(var(--ui-destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--ui-muted))',
          foreground: 'hsl(var(--ui-muted-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--ui-popover))',
          foreground: 'hsl(var(--ui-popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--ui-card))',
          foreground: 'hsl(var(--ui-card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

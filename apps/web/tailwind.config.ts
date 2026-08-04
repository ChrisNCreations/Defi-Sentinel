import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas-cream)',
        ivory: 'var(--color-surface-ivory)',
        ink: 'var(--color-ink-charcoal)',
        slate: 'var(--color-slate-gray)',
        steel: 'var(--color-steel-gray)',
        hairline: 'var(--color-hairline)',
        cobalt: {
          DEFAULT: 'var(--color-electric-cobalt)',
          deep: 'var(--color-deep-cobalt)',
        },
        forest: 'var(--color-forest)',
        danger: 'var(--color-danger)',
        lavender: 'var(--color-lavender-mist)',
        powder: 'var(--color-powder-blue)',
        violet: 'var(--color-vivid-violet)',
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'Roobert',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: 'var(--radius-cards)',
        pill: 'var(--radius-buttons)',
        badge: 'var(--radius-badges)',
      },
      boxShadow: {
        subtle: 'var(--shadow-subtle)',
        soft: 'var(--shadow-soft)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
}

export default config

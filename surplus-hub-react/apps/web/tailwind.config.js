/** @type {import('tailwindcss').Config} */
// Surplus Hub Design System — see docs/DESIGN_SYSTEM.md (§10 tokens).
// Values mirror globals.css :root (1a 시안); globals.css is canonical.
// Literal hexes are kept (not var()) so alpha modifiers like bg-primary/20 work.
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // --- semantic (remapped) ---
        primary: {
          DEFAULT: '#ed701d',   // 1a 시안 orange
          light: '#fdf0e7',     // accent-soft
          dark: '#e65c00',
          foreground: '#FFFFFF',
        },
        background: {
          DEFAULT: '#f9f7f6',   // paper
          light: '#f9f7f6',
          secondary: '#f1f0ee', // field
          tertiary: '#f1f0ee',
        },
        foreground: {
          DEFAULT: '#151c28',   // ink
        },
        card: {
          DEFAULT: '#FFFFFF',   // surface
          foreground: '#151c28',
        },
        muted: {
          DEFAULT: '#f1f0ee',   // field
          foreground: '#6a7181', // ink-2
        },
        accent: {
          DEFAULT: '#fdf0e7',   // accent-soft
          foreground: '#a54a0d',
        },
        secondary: {
          DEFAULT: '#f1f0ee',
          foreground: '#151c28',
        },
        border: {
          DEFAULT: '#e2e4e9',   // line
          primary: '#e2e4e9',
          secondary: '#EBE3D8', // line-2
        },
        input: '#e2e4e9',
        ring: '#ed701d',
        destructive: { DEFAULT: '#C0492B', foreground: '#FFFFFF' },
        success: { DEFAULT: '#3F5A29', foreground: '#FFFFFF' },   // olive
        warning: { DEFAULT: '#B8761F', foreground: '#FFFFFF' },
        info: { DEFAULT: '#5E564C', foreground: '#FFFFFF' },

        // --- design-system named tokens (use these going forward) ---
        ink: { DEFAULT: '#151c28', 2: '#6a7181', 3: '#8C8275' },
        paper: '#f9f7f6',
        surface: '#FFFFFF',
        field: '#f1f0ee',
        line: { DEFAULT: '#e2e4e9', 2: '#EBE3D8' },
        olive: { DEFAULT: '#3F5A29', tx: '#3F5A29', bg: '#EFF3E6', bd: '#D2DCBE' },
      },
      borderRadius: {
        chip: '6px',
        field: '12px',
        thumb: '14px',
        btn: '16px',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'Apple SD Gothic Neo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,27,23,0.04)',
        fab: '0 6px 16px rgba(237,112,29,.28)',
      },
    },
  },
  plugins: [],
}

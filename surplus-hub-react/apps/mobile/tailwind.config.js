/** @type {import('tailwindcss').Config} */
// Surplus Hub Design System (nativewind) — mirrors apps/web/tailwind.config.js (1a 시안).
// Canonical tokens: apps/web/src/app/globals.css :root + root design.md. Keep in sync with web.
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // --- semantic (remapped) ---
        primary: {
          DEFAULT: '#ed701d',   // 1a 시안 orange (accent)
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
    },
  },
  plugins: [],
}

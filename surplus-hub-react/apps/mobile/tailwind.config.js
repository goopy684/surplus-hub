/** @type {import('tailwindcss').Config} */
// Surplus Hub Design System (nativewind) — mirrors apps/web/tailwind.config.js (B · 밝은 카탈로그).
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
          DEFAULT: '#1E3FCC',   // 1a 시안 orange (accent)
          light: '#E8EDFB',     // accent-soft
          dark: '#16309E',
          foreground: '#FFFFFF',
        },
        background: {
          DEFAULT: '#FFFFFF',   // paper
          light: '#FFFFFF',
          secondary: '#F2F4F8', // field
          tertiary: '#F5F6F9',
        },
        foreground: {
          DEFAULT: '#121620',   // ink
        },
        card: {
          DEFAULT: '#FFFFFF',   // surface
          foreground: '#121620',
        },
        muted: {
          DEFAULT: '#F2F4F8',   // field
          foreground: '#5A6273', // ink-2
        },
        accent: {
          DEFAULT: '#E8EDFB',   // accent-soft
          foreground: '#16309E',
        },
        secondary: {
          DEFAULT: '#F2F4F8',
          foreground: '#121620',
        },
        border: {
          DEFAULT: '#DDE1E8',   // line
          primary: '#DDE1E8',
          secondary: '#EBEEF3', // line-2
        },
        input: '#DDE1E8',
        ring: '#1E3FCC',
        destructive: { DEFAULT: '#C2362B', foreground: '#FFFFFF' },
        success: { DEFAULT: '#1F7A4D', foreground: '#FFFFFF' },   // olive
        warning: { DEFAULT: '#A8650F', foreground: '#FFFFFF' },
        info: { DEFAULT: '#5A6273', foreground: '#FFFFFF' },

        // --- design-system named tokens (use these going forward) ---
        ink: { DEFAULT: '#121620', 2: '#5A6273', 3: '#8A92A3' },
        paper: '#FFFFFF',
        canvas: '#F5F6F9',
        surface: '#FFFFFF',
        field: '#F2F4F8',
        line: { DEFAULT: '#DDE1E8', 2: '#EBEEF3' },
        olive: { DEFAULT: '#1F7A4D', tx: '#1F7A4D', bg: '#E7F4EC', bd: '#BFE0CC' },
      },
      borderRadius: {
        chip: '9999px',
        field: '14px',
        thumb: '16px',
        btn: '14px',
        card: '16px',
      },
    },
  },
  plugins: [],
}

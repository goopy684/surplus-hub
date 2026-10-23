/** @type {import('tailwindcss').Config} */
// Surplus Hub Design System — see design.md (B · 밝은 카탈로그, 2026-10-05).
// Values mirror globals.css :root; globals.css is canonical.
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
          DEFAULT: '#1E3FCC',   // cobalt — 흰 글자 대비 7.5:1
          light: '#E8EDFB',     // accent-soft
          dark: '#16309E',      // :active
          foreground: '#FFFFFF',
        },
        background: {
          DEFAULT: '#FFFFFF',   // paper
          light: '#FFFFFF',
          secondary: '#F2F4F8', // field
          tertiary: '#F5F6F9',  // canvas
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
        success: { DEFAULT: '#1F7A4D', foreground: '#FFFFFF' },
        warning: { DEFAULT: '#A8650F', foreground: '#FFFFFF' },
        info: { DEFAULT: '#5A6273', foreground: '#FFFFFF' },

        // --- design-system named tokens (use these going forward) ---
        ink: { DEFAULT: '#121620', 2: '#5A6273', 3: '#8A92A3' },
        paper: '#FFFFFF',
        canvas: '#F5F6F9',
        surface: '#FFFFFF',
        field: '#F2F4F8',
        line: { DEFAULT: '#DDE1E8', 2: '#EBEEF3' },
        // 등급 "상" — 이름은 호환 위해 olive 유지, 값은 그린 계열
        olive: { DEFAULT: '#1F7A4D', tx: '#1F7A4D', bg: '#E7F4EC', bd: '#BFE0CC' },
      },
      borderRadius: {
        chip: '9999px',
        field: '14px',
        thumb: '16px',
        btn: '14px',
        card: '16px',
      },
      fontFamily: {
        sans: ['"Gothic A1"', '-apple-system', '"Apple SD Gothic Neo"', 'system-ui', 'sans-serif'],
        num: ['"Space Grotesk"', '"Gothic A1"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,22,32,0.04)',
        fab: '0 8px 20px rgba(30,63,204,0.28)',
      },
    },
  },
  plugins: [],
}

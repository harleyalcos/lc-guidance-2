/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "background": "var(--color-background)",
        "surface": "var(--color-surface)",
        "surface-container": "var(--color-surface-container)",
        "surface-container-low": "var(--color-surface-container-low)",
        "surface-container-high": "var(--color-surface-container-high)",
        "surface-container-highest": "var(--color-surface-container-highest)",
        "surface-bright": "var(--color-surface-bright)",
        "on-background": "var(--color-on-surface)",
        "on-surface": "var(--color-on-surface)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        "surface-variant": "var(--color-surface-variant)",
        "outline": "var(--color-outline)",
        "outline-variant": "var(--color-outline-variant)",
        "primary": "var(--color-primary)",
        "primary-container": "var(--color-primary-container)",
        "on-primary": "var(--color-on-primary)",
        "on-primary-container": "var(--color-on-primary-container)",
        "secondary": "var(--color-secondary)",
        "secondary-container": "var(--color-secondary-container)",
        "on-secondary-container": "var(--color-on-secondary-container)",
        "error": "var(--color-error)",
        "error-container": "var(--color-error-container)",
        "on-error-container": "var(--color-on-error-container)",

        /* Add some specific hardcoded tokens we haven't mapped yet, to avoid compilation errors if used */
        "primary-fixed-dim": "#b4c5ff",
        "secondary-fixed-dim": "#c0c7d6",
        "secondary-fixed": "#dce2f3",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      borderWidth: {
        "DEFAULT": "2px",
      },
      divideWidth: {
        "DEFAULT": "2px",
      },
      spacing: {
        "stack-md": "1rem",
        "stack-sm": "0.5rem",
        "margin-page": "2rem",
        "sidebar-width": "270px",
        "table-cell-padding": "12px 16px",
        "gutter": "1.5rem"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "'Courier New'", "monospace"],
        "body-lg": ["var(--font-sans)", "system-ui", "sans-serif"],
        "label-caps": ["var(--font-sans)", "system-ui", "sans-serif"],
        "body-md": ["var(--font-sans)", "system-ui", "sans-serif"],
        "section-header": ["var(--font-serif)", "Georgia", "serif"],
        "data-mono": ["var(--font-mono)", "'Courier New'", "monospace"],
        "display-title": ["var(--font-serif)", "Georgia", "serif"]
      },
      fontSize: {
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "label-caps": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "section-header": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "data-mono": ["13px", { lineHeight: "18px", fontWeight: "450" }],
        "display-title": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }]
      }
    },
  },
  plugins: [],
}

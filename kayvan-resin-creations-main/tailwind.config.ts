import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    screens: {
      // Mobile-first approach
      'xs': '375px',     // Small mobile
      'sm': '640px',     // Mobile
      'md': '768px',     // Tablet
      'lg': '1024px',    // Laptop
      'xl': '1280px',    // Desktop
      '2xl': '1400px',   // Large desktop
    },
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
        xl: '2.5rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontSize: {
        // Fluid typography for mobile
        'xs-fluid': ['0.75rem', { lineHeight: '1rem' }],
        'sm-fluid': ['0.875rem', { lineHeight: '1.25rem' }],
        'base-fluid': ['1rem', { lineHeight: '1.5rem' }],
        'lg-fluid': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl-fluid': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl-fluid': ['1.5rem', { lineHeight: '2rem' }],
        '3xl-fluid': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl-fluid': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl-fluid': ['3rem', { lineHeight: '1' }],
        '6xl-fluid': ['3.75rem', { lineHeight: '1' }],
        '7xl-fluid': ['4.5rem', { lineHeight: '1' }],
        '8xl-fluid': ['6rem', { lineHeight: '1' }],
        '9xl-fluid': ['8rem', { lineHeight: '1' }],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      minHeight: {
        'screen-safari': ['100vh', '100dvh'],
        'screen': ['100vh', '100dvh'],
      },
      height: {
        'screen-safari': ['100vh', '100dvh'],
        'screen': ['100vh', '100dvh'],
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        sans: ['Montserrat', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        kayvan: {
          blue: "hsl(var(--kayvan-blue))",
          "blue-light": "hsl(var(--kayvan-blue-light))",
          "blue-dark": "hsl(var(--kayvan-blue-dark))",
          pink: "hsl(var(--kayvan-pink))",
          "pink-light": "hsl(var(--kayvan-pink-light))",
          "pink-dark": "hsl(var(--kayvan-pink-dark))",
          cream: "hsl(var(--kayvan-cream))",
          gold: "hsl(var(--kayvan-gold))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.8s ease-out forwards",
        "fade-in": "fade-in 0.6s ease-out forwards",
        "scale-in": "scale-in 0.5s ease-out forwards",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // Plugin for touch device optimizations
    function({ addUtilities }) {
      addUtilities({
        '.tap-highlight-transparent': {
          '-webkit-tap-highlight-color': 'transparent',
        },
        '.touch-manipulation': {
          'touch-action': 'manipulation',
        },
      })
    },
  ],
} satisfies Config;
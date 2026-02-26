import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
            },
            colors: {
                "lawn-green": {
                    50: "#f0fdf4",
                    100: "#dcfce7",
                    200: "#bbf7d0",
                    300: "#86efac",
                    400: "#4ade80",
                    500: "#22c55e",
                    600: "#16a34a",
                    700: "#166534",
                    800: "#14532d",
                    900: "#052e16",
                },
                earth: {
                    100: "#fdf8f0",
                    200: "#f5e6d0",
                    300: "#d4a574",
                    400: "#b8864e",
                    500: "#92683a",
                },
            },
            keyframes: {
                "pulse-glow": {
                    "0%, 100%": { boxShadow: "0 0 0 0 rgba(22, 101, 52, 0.4)" },
                    "50%": { boxShadow: "0 0 0 12px rgba(22, 101, 52, 0)" },
                },
                "slide-up": {
                    from: { transform: "translateY(20px)", opacity: "0" },
                    to: { transform: "translateY(0)", opacity: "1" },
                },
                "fade-in": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
            },
            animation: {
                "pulse-glow": "pulse-glow 2s ease-in-out infinite",
                "slide-up": "slide-up 0.4s ease-out",
                "fade-in": "fade-in 0.3s ease-out",
            },
        },
    },
    plugins: [animate],
};

export default config;

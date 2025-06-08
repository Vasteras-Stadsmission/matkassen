/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    return {
        plugins: [react()],
        test: {
            environment: "happy-dom",
            globals: true,
            setupFiles: ["__tests__/setup.ts"],
            include: ["__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
            exclude: ["node_modules", "dist", ".next"],
            deps: {
                external: [],
            },
        },
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./"),
            },
            conditions: ["node", "default"],
        },
        define: {
            "process.env": env,
        },
    };
});

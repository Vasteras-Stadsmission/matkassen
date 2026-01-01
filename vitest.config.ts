/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Shared configuration for all test workspaces
const sharedConfig = ({ mode }: { mode: string }) => {
    const env = loadEnv(mode, process.cwd(), "");

    return {
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./"),
            },
            conditions: ["node", "default"],
            extensionAlias: {
                ".js": [".js", ".ts", ".tsx"],
                ".mjs": [".mjs", ".mts"],
                ".cjs": [".cjs", ".cts"],
            },
        },
        define: {
            "process.env": env,
        },
    };
};

export default defineConfig(({ mode }) => ({
    ...sharedConfig({ mode }),
    test: {
        // Project configuration for separating unit and integration tests
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    environment: "happy-dom",
                    globals: true,
                    setupFiles: ["__tests__/setup.ts"],
                    include: ["__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
                    exclude: [
                        "node_modules",
                        "dist",
                        ".next",
                        "__tests__/**/*.integration.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
                    ],
                    server: {
                        deps: {
                            inline: ["next-auth", "next/server", "@auth/core"],
                        },
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: "integration",
                    environment: "node",
                    globals: true,
                    setupFiles: ["__tests__/integration/setup.ts"],
                    include: ["__tests__/**/*.integration.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
                    exclude: ["node_modules", "dist", ".next"],
                    // Integration tests run serially to avoid PGlite conflicts
                    // fileParallelism: false ensures test files run sequentially (Vitest 4)
                    fileParallelism: false,
                    server: {
                        deps: {
                            inline: ["next-auth", "next/server", "@auth/core"],
                        },
                    },
                },
            },
        ],
    },
}));

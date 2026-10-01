import { defineConfig } from "vitest/config";

export default defineConfig({
    // Mirrors the build-time global in esbuild.config.mjs (see src/buildInfo.ts).
    define: {
        __DEV__: "false",
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "happy-dom",
        server: {
            deps: {
                inline: ["js-ballistics"],
            },
        },
    },
    resolve: {
        extensions: [".ts", ".js", ".mjs", ".json"],
    },
});

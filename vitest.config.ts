import { defineConfig } from "vitest/config";

export default defineConfig({
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

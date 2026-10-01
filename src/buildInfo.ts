// buildInfo.ts - facts baked into the bundle at build time. esbuild's `define`
// supplies the global (esbuild.config.mjs); vitest.config.ts mirrors it.

declare const __DEV__: boolean;

/** True for `npm run dev` bundles, false for production builds. */
export const DEV_BUILD: boolean = __DEV__;

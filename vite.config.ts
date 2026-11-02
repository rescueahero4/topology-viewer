import { defineConfig } from "vite";

// Runs after `vite.core.config.ts`, so it keeps `dist/core-bundle.js`.
export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: {
        index: "src/public/index.ts",
        react: "src/public/react.ts",
        "profiles/qdic": "src/public/profiles/qdic.ts",
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: [/^react($|\/)/, /core-bundle\.js$/],
      output: { chunkFileNames: "[name]-[hash].js" },
    },
  },
});

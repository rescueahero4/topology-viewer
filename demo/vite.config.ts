import { defineConfig } from "vite";

// `file:..` is a symlink, so the library would find the React of the root. The demo has one React.
export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      input: { index: "index.html", cases: "cases.html", csp: "csp.html" },
    },
  },
});

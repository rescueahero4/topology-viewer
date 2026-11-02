import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const SWAPS = [
  ["./source", "contract/profile/index.ts", "src/contract/profile/source.build.ts"],
  ["./sprite.json", "renderer/sprite.ts", "src/renderer/sprite.build.ts"],
];

// The tests use the QDIC vocabulary. The build reads the vocabulary from the `createCore` argument,
// so that the QDIC data stays out of the core.
function configSources(): Plugin {
  return {
    name: "topology-viewer:config-sources",
    enforce: "pre",
    resolveId(id, importer) {
      const from = importer?.replaceAll("\\", "/");
      const swap = SWAPS.find(([name, file]) => id === name && from?.endsWith(file));
      return swap && path.join(import.meta.dirname, swap[2]);
    },
  };
}

// All module state goes inside one function, so that each `createCore` call makes a new copy.
function coreFactory(): Plugin {
  return {
    name: "topology-viewer:core-factory",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle))
        if (chunk.type === "chunk")
          chunk.code = `export function createCore(__TV_CONFIG__) {\n${chunk.code}\nreturn __tvCore.api;\n}\n`;
    },
  };
}

export default defineConfig({
  plugins: [configSources(), coreFactory()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/public/coreEntry.ts",
      formats: ["iife"],
      name: "__tvCore",
      fileName: () => "core-bundle.js",
    },
  },
});

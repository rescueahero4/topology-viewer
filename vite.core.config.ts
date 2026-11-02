import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const SOURCE_FOR_BUILD = path.join(
  import.meta.dirname,
  "src/contract/profile/source.build.ts",
);

// The tests use the QDIC profile, the vocabulary that they are written for. The build reads the
// profile from the `createCore` argument, with a neutral profile as the default, so that the QDIC
// data stays out of the core.
function profileSource(): Plugin {
  return {
    name: "topology-viewer:profile-source",
    enforce: "pre",
    resolveId(id, importer) {
      if (id === "./source" && importer?.replaceAll("\\", "/").endsWith("contract/profile/index.ts"))
        return SOURCE_FOR_BUILD;
      return null;
    },
  };
}

// All module state of the UI goes inside one function. A call of `createCore` makes a new copy of
// that state, so that two viewers on one page do not share signals, Preact or a profile.
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
  plugins: [profileSource(), coreFactory()],
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

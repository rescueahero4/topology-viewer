import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import links from "starlight-links-validator";

const GITHUB = "https://github.com/rescueahero4/topology-viewer";

export default defineConfig({
  site: "https://rescueahero4.github.io",
  base: "/topology-viewer",
  integrations: [
    starlight({
      title: "Topology Viewer",
      description:
        "A graph explorer component for your API. Canvas, inspector, search, filters and an editable table, and every part of it can be customized.",
      logo: { src: "./src/assets/logo.svg", alt: "" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: GITHUB }],
      editLink: { baseUrl: `${GITHUB}/edit/main/docs/` },
      customCss: ["./src/styles/custom.css"],
      lastUpdated: true,
      plugins: [links()],
      sidebar: [
        {
          label: "Start here",
          items: [
            { slug: "start/introduction" },
            { slug: "start/installation" },
            { slug: "start/quick-start" },
            { slug: "start/data" },
            { slug: "start/frameworks" },
          ],
        },
        {
          label: "Customize",
          items: [
            { slug: "customize/overview" },
            { slug: "customize/themes" },
            { slug: "customize/dark-mode" },
            { slug: "customize/css" },
            { slug: "customize/tailwind" },
            { slug: "customize/your-components" },
            { slug: "customize/reusable-viewers" },
          ],
        },
        {
          label: "Components",
          items: [
            { slug: "components/canvas" },
            { slug: "components/filters" },
            { slug: "components/search" },
            { slug: "components/display-options" },
            { slug: "components/inspector" },
            { slug: "components/table" },
            { slug: "components/saving" },
            { slug: "components/fullscreen" },
            { slug: "components/types-and-icons" },
          ],
        },
        {
          label: "Advanced",
          items: [
            { slug: "advanced/commands" },
            { slug: "advanced/actions" },
            { slug: "advanced/keyboard" },
            { slug: "advanced/without-react" },
            { slug: "advanced/security" },
            { slug: "advanced/forking" },
            { slug: "advanced/upgrading" },
          ],
        },
        {
          label: "Examples",
          items: [
            { slug: "examples/service-map" },
            { slug: "examples/data-catalog" },
            { slug: "examples/admin-table" },
          ],
        },
        {
          label: "Reference",
          items: [
            { slug: "reference/props" },
            { slug: "reference/parts" },
            { slug: "reference/tokens" },
            { slug: "reference/commands" },
            { slug: "reference/types" },
          ],
        },
      ],
    }),
    react(),
  ],
  vite: {
    // `file:..` is a symlink, so the library would find the React of the repository root.
    resolve: { dedupe: ["react", "react-dom"] },
    server: { fs: { allow: [".."] } },
  },
});

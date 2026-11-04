import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  workers: 3,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4610/topology-viewer/",
    viewport: { width: 1360, height: 900 },
  },
  webServer: {
    command: "npx astro preview --host 127.0.0.1 --port 4610",
    url: "http://127.0.0.1:4610/topology-viewer/",
    reuseExistingServer: true,
  },
});

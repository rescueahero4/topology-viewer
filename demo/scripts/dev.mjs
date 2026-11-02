// Starts the mock API and the Vite dev server. Ctrl+C stops both.
import { spawn } from "node:child_process";

const run = (command) => spawn(command, { shell: true, stdio: "inherit" });
const children = [run("node server/api.mjs"), run("npx vite --port 4601")];

process.on("SIGINT", () => {
  for (const child of children) child.kill();
  process.exit(0);
});

// Fails when the package or the demo crosses its border, or when a dependency has a licence that is
// not on the list.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHIPPED = ["dist/", "types/", "CUSTOMIZING.md", "FORKING.md", "LICENSE", "README.md", "THIRD-PARTY-NOTICES.txt", "package.json"];
const BUNDLED = ["preact", "@preact/signals", "d3-drag", "d3-ease", "d3-force", "d3-hierarchy", "d3-selection", "d3-timer", "d3-zoom", "zod"];
const LICENCES = new Set(["MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "BlueOak-1.0.0", "CC0-1.0", "MPL-2.0", "Python-2.0", "CC-BY-4.0"]);

const problems = [];
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const walk = (dir) =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : [file];
  });

// 1. npm installs only the shipped files.
const pack = JSON.parse(execSync("npm pack --dry-run --json --ignore-scripts", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
for (const { path: file } of pack.files)
  if (!SHIPPED.some((allowed) => file === allowed || (allowed.endsWith("/") && file.startsWith(allowed))))
    problems.push(`shipped by mistake: ${file}`);
if (read("package.json").includes('"dependencies"')) problems.push("the package has runtime dependencies");

// 2. The demo uses only the public entries, and the library never reads the demo.
const IMPORT = /(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g;
for (const file of [...walk("demo/src"), ...walk("demo/e2e"), ...walk("demo/server").filter((f) => f.endsWith(".mjs"))])
  for (const [, name] of read(file).matchAll(IMPORT))
    if (name.startsWith(".") && !path.resolve(ROOT, path.dirname(file), name).startsWith(path.join(ROOT, "demo")))
      problems.push(`${file} imports outside the demo: ${name}`);
    else if (/^topology-viewer\/(?!react$|profiles\/qdic$)/.test(name))
      problems.push(`${file} imports a private path: ${name}`);
// The demos of the site show developers how to use the package, so they use it as a developer does.
for (const file of walk("docs/src/demos").filter((f) => /\.tsx?$/.test(f)))
  for (const [, name] of read(file).matchAll(IMPORT))
    if (name.startsWith(".") && !path.resolve(ROOT, path.dirname(file), name).startsWith(path.join(ROOT, "docs", "src", "demos")))
      problems.push(`${file} imports outside the demos: ${name}`);
    else if (/^topology-viewer\/(?!react$|profiles\/qdic$)/.test(name))
      problems.push(`${file} imports a private path: ${name}`);
for (const file of walk("src"))
  if (/\.tsx?$/.test(file) && /["'][^"']*\bdemo\//.test(read(file)))
    problems.push(`${file} reads the demo`);

// 3. Each dependency has an allowed licence, and each bundled one is in the notices.
const installScripts = [];
for (const lock of ["package-lock.json", "demo/package-lock.json"]) {
  const { packages } = JSON.parse(read(lock));
  for (const [name, entry] of Object.entries(packages)) {
    if (name === "" || entry.link) continue;
    if (entry.hasInstallScript) installScripts.push(name.replace(/^.*node_modules\//, ""));
    const licence = entry.license ?? "unknown";
    const allowed = String(licence).replace(/[()]/g, "").split(/ OR | AND /).some((one) => LICENCES.has(one));
    if (!allowed && !name.startsWith("..")) problems.push(`${lock}: ${name} has the licence ${licence}`);
  }
}
const { packages } = JSON.parse(read("package-lock.json"));
const notices = read("THIRD-PARTY-NOTICES.txt");
const seen = new Set();
const visit = (name) => {
  if (seen.has(name)) return;
  seen.add(name);
  const entry = packages[`node_modules/${name}`];
  if (!notices.includes(`== ${name} (`)) problems.push(`not in the notices: ${name}`);
  for (const dep of Object.keys(entry?.dependencies ?? {})) visit(dep);
};
BUNDLED.forEach(visit);

console.log(`package: ${pack.files.length} files, ${(pack.size / 1024).toFixed(0)} KB packed, ${(pack.unpackedSize / 1024).toFixed(0)} KB unpacked`);
console.log(`bundled libraries: ${seen.size}`);
console.log(`install scripts: ${installScripts.join(", ") || "none"}`);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("ok");

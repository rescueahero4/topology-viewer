# Forking topology-viewer

Fork when [CUSTOMIZING.md](CUSTOMIZING.md) does not reach what you need, such as adding table rows or replacing the renderer. It is MIT licensed, and a fork is normal use. Keep the licence and `THIRD-PARTY-NOTICES.txt`.

A fork costs you the upstream merges, so check first whether a part's `render` or an `on` handler does the job.

## Install your fork

```sh
npm install git+https://github.com/YOUR-NAME/topology-viewer.git
```

`npm install` runs `prepare`, which builds `dist/`. Your project imports it the same way as the original.

To work on the fork next to your project:

```sh
cd topology-viewer && npm install && npm run build
cd ../your-project && npm install ../topology-viewer
```

Run `npm run build` in the fork after each change. To try a change without your project, use `npm run demo`.

## How the code is arranged

Each layer imports only the ones above it.

| Path | What it does | Change it to |
|---|---|---|
| `src/contract/` | Parses and checks a payload and a profile | Accept a new payload field |
| `src/engine/` | The graph: normalizing, filters, layout, edits. No DOM | Add an engine feature, such as row add and delete |
| `src/renderer/` | Draws the canvas with D3 and SVG | Change how the canvas draws |
| `src/ui/` | The panels, in Preact | Change or replace a panel |
| `src/public/` | The package: mount, React wrapper, themes, slots | Change the public API |
| `demo/` | A separate app and the browser tests. It uses only the public API | Try a change |

The whole UI runs in a browser with no backend. Everything in `src/` except `src/public/` goes into one bundle, `dist/core-bundle.js`, wrapped in `createCore()`. Each viewer calls it, so each viewer has its own copy of all module state.

## Replace a component

Every public part is wrapped once, at the end of its file. This is the one line to change:

```tsx
// src/ui/InspectorHeader.tsx
export const InspectorHeader = extendable("inspector-header", InspectorHeaderView, ...);
```

Change `InspectorHeaderView`, or point the line at your own component, and every use follows. The `parts` option keeps working on it. The components are Preact, with `class` rather than `className`.

Other common changes:

| Change | Where |
|---|---|
| The look | `src/ui/shell-*.css` and `src/ui/tokens.css` |
| The default icons | `assets/figma-raw/`, then `node scripts/build-icons.mjs` |
| Interface text | `src/ui/strings/en.ts` and `ja.ts` |
| A new public part | Wrap it with `extendable`, and add its name to `BEHAVIOUR_PARTS` in `src/ui/partNames.ts` and to `types/parts.d.ts` |
| A new action | `src/ui/actions.ts`, and add its name to `CHECKED` so that `on` sees it |
| A new engine action | `Action` in `src/engine/state/canvasState.ts`, then `transition` in `src/engine/view/story.ts` |

## Comments in the code

Many comments cite documents that are not in this repository: `STORY-004-07 rule 3`, `SA §4.5`, `FR-CANVAS-13`, `ddr-0047`, and line numbers of `mockup app.js`. They were the requirements and the design prototype of the original project.

You do not need them. Read each such comment as "this behaviour is deliberate, and a test usually pins it". If a test fails after your change, it is telling you which behaviour you changed, and you decide whether that was your intent.

## Tests

```sh
npm test && npm run typecheck && npm run check
npm --prefix demo run test:e2e
```

- `*.test.ts(x)` next to the code. Some pin exact values of the original look, so a change of the look can fail one of them on purpose.
- `*.perf.test.ts` pin time limits at 2,000 nodes.
- `src/ui/canvas/domAudit.ts` is a security check of the canvas DOM, with an allow-list in `domAllowList.ts`. Add new names there rather than turning it off.
- `demo/e2e/` runs the real package in a browser.

## Keep the security rules

The payload is untrusted. These rules keep it from becoming script in your page:

- No model text in `innerHTML`, in an attribute name or in a selector.
- Icons are built as elements from data, never from markup.
- A link goes through `linkOf`, which refuses `javascript:` and the like.
- A name from a payload is read with `Object.hasOwn`, so `__proto__` is just a name.

The hostile-payload tests check these. Keep them passing.

## Stay close to upstream

```sh
git remote add upstream https://github.com/rescueahero4/topology-viewer.git
git fetch upstream && git merge upstream/main
```

Merges stay easier when you add new files and change few lines. A `render` in your project beats an edit in the fork. An edit in `src/ui/` is easier to merge than one in `src/engine/`.

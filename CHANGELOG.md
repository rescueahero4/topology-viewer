# Changelog

Every change to the library that a developer can notice, by version. The newest version comes first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/). Before 1.0.0, a breaking change raises the minor version.

To record a change, add it under **Unreleased**. To release, change `version` in `package.json` and rename **Unreleased** to that version with the date. `npm run check` fails if the version in `package.json` has no entry here.

## [Unreleased]

### Changed

- The library is now called Data Topology Viewer. The package name and the imports stay `topology-viewer`.

## [0.2.0] - 2026-11-04

### Breaking

- `variant` defaults to `"page"`, which has labels on its controls and square corners. For the compact look with the rounded frame, set `variant="widget"`.
- Full screen fills the browser view, and no longer uses the Fullscreen API by default. To use the Fullscreen API, set `fullscreen="native"`.
- `onSave` gets only the changes since the last save, so a second save no longer sends the first one again. The full list is in the second argument:

  ```tsx
  onSave={(changes, { all }) => send(all)}
  ```

- `/` with Ctrl or Cmd held no longer focuses the search.

### Added

- Public `--tv-*` tokens, themes and colour modes. The node contrast check follows the canvas colour of the theme.
- A public part name on every element, for `::part`, `className` and `style`.
- `styles` and `pageStyles`, for custom CSS and Tailwind inside the Shadow DOM. The CSS of the viewer sits in a cascade layer.
- `parts`, which gives each sub-component `options`, `on`, `before`, `after`, `items` and `render`. Custom content keeps the CSS of the page and the React context.
- `onAction`, commands on the ref, state events and a keyboard map.
- Options for filters, custom filters, display options, search, inspector fields, table columns, validation and cell editors.
- Any component as a canvas node, edge styles, a custom tooltip and custom layouts.
- `defineProfile`, for types and icons, and `createTopologyViewer`, for a reusable preset.
- `onSave` can return a promise. The bar waits for it, and a failure keeps the edits.
- The full-screen button also shows in the `page` variant.
- A warning when a parent with `isolation` or its own `z-index` keeps the full view under something.
- A description of each command and option in the types, for the editor.
- A public part name on the canvas tooltip.
- `CUSTOMIZING.md`, `FORKING.md` and a documentation site with live demos.

### Fixed

- The controls and menus no longer come over a sticky header of the page.

## [0.1.0] - 2026-11-02

### Added

- The first standalone package: the `TopologyViewer` React component and `mountTopology`.
- `data`, `url` and `load` as the sources of a graph, with load states and events.
- The options `profile`, `variant`, `lang`, `strings`, `onError`, `onSelect` and `onSave`.
- A separate state and Shadow DOM root for each viewer.
- A default profile with no node types, and the QDIC profile as an optional preset.
- A payload limit of 8 MB.
- The MIT licence.

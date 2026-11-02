import controls from "../ui/shell-controls.css?inline";
import edit from "../ui/shell-edit.css?inline";
import embedded from "../ui/shell-embedded.css?inline";
import frame from "../ui/shell-frame.css?inline";
import inspector from "../ui/shell-inspector.css?inline";
import menus from "../ui/shell-menus.css?inline";
import narrow from "../ui/shell-narrow.css?inline";
import notices from "../ui/shell-notices.css?inline";
import panels from "../ui/shell-panels.css?inline";
import relations from "../ui/shell-relations.css?inline";
import workbench from "../ui/shell-workbench.css?inline";
import tokens from "../ui/tokens.css?inline";

// The tokens go on the Shadow DOM host. A rule of the page on the host element wins over `:host`,
// so a page can set a token, and the tokens do not touch the page.
const HOST = `:host{display:block;position:relative;color-scheme:light}
:host(:fullscreen){width:100%;height:100%}
.tv-mount{height:100%}`;

// A viewer with no node types in its profile: all types are "custom", so the tag says nothing.
export const NO_TYPES_RULE = `.prov{display:none}.fam-head:empty{display:none}`;

export const styleText = [
  tokens.replaceAll(":root", ":host"),
  frame,
  controls,
  menus,
  inspector,
  relations,
  panels,
  workbench,
  edit,
  notices,
  narrow,
  embedded,
  HOST,
].join("\n");

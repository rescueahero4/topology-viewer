import type { Lang } from "#engine";
import type { RendererText } from "#renderer";
import { t } from "./strings/index";

// why: mockup `plural` (lib/topology.js lines 326-329) — a group node names its type in the plural;
// this is a word form of English, not a text, and Japanese has no plural form
const PLURAL: Readonly<Record<Lang, (label: string) => string>> = {
  en: (label) =>
    /s$/i.test(label)
      ? label
      : /y$/i.test(label)
        ? `${label.slice(0, -1)}ies`
        : `${label}s`,
  ja: (label) => label,
};

// why: P4-1, rule 8 — every key of the delivered `RendererText` comes from the string tables
export function rendererText(lang: Lang): RendererText {
  return {
    groupLabel: (typeLabel) =>
      t(lang, "canvas.group", { type: PLURAL[lang](typeLabel) }),
    collapsed: t(lang, "canvas.collapsed"),
    unknownType: t(lang, "unknownType"),
    canvasName: t(lang, "canvas.name"),
    tipGroup: (count, typeLabel) =>
      t(lang, "canvas.tipGroup", { count, type: typeLabel }),
    tipOpened: (sub) => t(lang, "canvas.tipOpened", { sub }),
    tipMore: (sub, more) => t(lang, "canvas.tipMore", { sub, count: more }),
    tipMember: (sub) => t(lang, "canvas.tipMember", { sub }),
    tipEdge: (subject, object) =>
      t(lang, "canvas.tipEdge", { subject, object }),
    tipEdgeAction: (label, muted, count, retired) =>
      t(lang, "canvas.tipEdgeAction", {
        label,
        filtered: muted ? t(lang, "canvas.filtered") : "",
        retired: retired ? t(lang, "canvas.retired") : "",
        links: count > 1 ? t(lang, "canvas.links", { count }) : "",
      }),
    // why: EPIC-003 hand-off H1 — a plain integer with no group separator and no plural
    bubbleCount: (count) =>
      t(lang, "canvas.bubbleCount", { count: String(count) }),
    lostMark: t(lang, "canvas.lost"),
    pillRetired: (label) => t(lang, "canvas.pillRetired", { label }),
  };
}

import { z } from "zod";

export const actionNameSchema = z.enum([
  "show-types",
  "reset-view",
  "retry",
  "table",
  "copy",
]);

const actionSchema = z.strictObject({
  label: z.string().min(1),
  primary: z.boolean(),
  icon: z.string().nullable(),
});

const actionTableSchema = z.record(actionNameSchema, actionSchema);

export type ActionName = z.infer<typeof actionNameSchema>;
type Labels = Record<ActionName, string>;

// why: ddr-0052 — the mockup ACTIONS give `primary` and `icon`; both languages share them
const LOOK = {
  "show-types": { primary: true, icon: null },
  "reset-view": { primary: true, icon: null },
  retry: { primary: true, icon: null },
  table: { primary: false, icon: null },
  copy: { primary: false, icon: "copy" },
} satisfies Record<ActionName, Omit<z.infer<typeof actionSchema>, "label">>;

const EN: Labels = {
  "show-types": "Show all types",
  "reset-view": "Reset to first view",
  retry: "Try again",
  table: "Open Dataset table",
  copy: "Copy details for the AI client",
};

const JA: Labels = {
  "show-types": "すべてのタイプを表示",
  "reset-view": "最初の表示に戻す",
  retry: "再試行",
  table: "データセット表を開く",
  copy: "AI クライアント向けの詳細をコピー",
};

function table(labels: Labels) {
  return actionTableSchema.parse(
    Object.fromEntries(
      actionNameSchema.options.map((name) => [
        name,
        { ...LOOK[name], label: labels[name] },
      ]),
    ),
  );
}

export const actions = { en: table(EN), ja: table(JA) };

// why: ddr-0052 — the message of the mockup `noticeText`, with one placeholder per part
export const copyMessage = {
  en: "The Quollio topology chart couldn't show your last result: {title}.\n{body}\nHow to fix it: {ai}\nDetails: {detail}",
  ja: "Quollio トポロジーチャートは前回の結果を表示できませんでした: {title}。\n{body}\n修正方法: {ai}\n詳細: {detail}",
};

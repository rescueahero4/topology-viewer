import { useState } from "react";
import { TopologyViewer, type TopologyTheme } from "topology-viewer/react";
import { DARK_THEME } from "../demos/data/dark-theme";
import services from "../demos/data/services.json";

type Values = {
  canvas: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  focus: string;
  frameRadius: number;
  radius: number;
  radiusSm: number;
  font: string;
};

const LIGHT: Values = {
  canvas: "#f4f4f5",
  surface: "#ffffff",
  text: "#3f3f46",
  textMuted: "#71717a",
  border: "#e4e4e7",
  accent: "#2563eb",
  focus: "#4f46e5",
  frameRadius: 0,
  radius: 6,
  radiusSm: 4,
  font: "",
};

const FONTS = [
  ["System", ""],
  ["Serif", "Georgia, serif"],
  ["Mono", "ui-monospace, monospace"],
  ["Rounded", "ui-rounded, system-ui, sans-serif"],
] as const;

const PRESETS: Readonly<Record<string, { values: Partial<Values>; extra?: TopologyTheme }>> = {
  Default: { values: {} },
  Dark: {
    values: {
      canvas: DARK_THEME.canvas,
      surface: DARK_THEME.surface,
      text: DARK_THEME.text,
      textMuted: DARK_THEME.textMuted,
      border: DARK_THEME.border,
      accent: DARK_THEME.accent,
      focus: DARK_THEME.focus,
    },
    extra: DARK_THEME,
  },
  Paper: {
    values: {
      canvas: "#faf6ee",
      surface: "#fffdf8",
      text: "#44403c",
      textMuted: "#78716c",
      border: "#e7e0d2",
      accent: "#b45309",
      focus: "#b45309",
      frameRadius: 12,
      radius: 10,
      radiusSm: 8,
      font: "Georgia, serif",
    },
  },
  Sharp: {
    values: {
      canvas: "#ffffff",
      border: "#18181b",
      text: "#18181b",
      accent: "#dc2626",
      focus: "#dc2626",
      frameRadius: 0,
      radius: 0,
      radiusSm: 0,
      font: "ui-monospace, monospace",
    },
  },
};

const COLOURS: readonly (keyof Values)[] = [
  "canvas",
  "surface",
  "text",
  "textMuted",
  "border",
  "accent",
  "focus",
];
const SIZES: readonly [keyof Values, number][] = [
  ["frameRadius", 32],
  ["radius", 20],
  ["radiusSm", 16],
];

const label = (key: string) =>
  key.replace(/[A-Z]/g, (one) => ` ${one.toLowerCase()}`).replace(/^./, (one) => one.toUpperCase());

/** Only what differs from the default goes into the theme and the code. */
function themeOf(values: Values, extra: TopologyTheme | undefined): TopologyTheme {
  const theme: TopologyTheme = { ...extra };
  for (const key of Object.keys(values) as (keyof Values)[]) {
    const value = values[key];
    if (value === LIGHT[key]) {
      delete theme[key];
      continue;
    }
    theme[key] = typeof value === "number" ? `${value}px` : value;
  }
  return theme;
}

const codeOf = (theme: TopologyTheme) => {
  const lines = Object.entries(theme).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`);
  if (lines.length === 0) return "<TopologyViewer data={graph} />";
  return `<TopologyViewer\n  data={graph}\n  theme={{\n${lines.join("\n")}\n  }}\n/>`;
};

/** Change the look with controls, and copy the code that it makes. */
export default function ThemePlayground() {
  const [values, setValues] = useState(LIGHT);
  const [preset, setPreset] = useState("Default");
  const [copied, setCopied] = useState(false);
  const theme = themeOf(values, PRESETS[preset]?.extra);
  const code = codeOf(theme);
  const set = (key: keyof Values, value: string | number) =>
    setValues((now) => ({ ...now, [key]: value }));

  return (
    <>
      <div className="playground">
        <div className="playground-controls">
          <label>
            Preset
            <select
              value={preset}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setPreset(name);
                setValues({ ...LIGHT, ...PRESETS[name]?.values });
              }}
            >
              {Object.keys(PRESETS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {COLOURS.map((key) => (
            <label key={key}>
              {label(key)}
              <input
                type="color"
                aria-label={label(key)}
                value={String(values[key])}
                onChange={(event) => set(key, event.currentTarget.value)}
              />
            </label>
          ))}
          {SIZES.map(([key, most]) => (
            <label key={key}>
              {label(key)}
              <input
                type="range"
                aria-label={label(key)}
                min={0}
                max={most}
                value={Number(values[key])}
                onChange={(event) => set(key, Number(event.currentTarget.value))}
              />
            </label>
          ))}
          <label>
            Font
            <select value={values.font} onChange={(event) => set("font", event.currentTarget.value)}>
              {FONTS.map(([name, value]) => (
                <option key={name} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ height: 504, padding: 12 }}>
          <TopologyViewer data={services} theme={theme} />
        </div>
      </div>
      <div className="demo-bar">
        <button
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? "Copied" : "Copy the code"}
        </button>
      </div>
      <pre className="playground-code" data-playground-code>
        {code}
      </pre>
    </>
  );
}

import { useRef, useState } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import services from "./data/services.json";

const COLOURS: Record<string, string> = { Go: "#0891b2", Rust: "#c2410c", Kotlin: "#7c3aed", Node: "#16a34a" };

function LanguagePicker(props: {
  value: unknown;
  commit: (value: unknown) => void;
  cancel: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {Object.keys(COLOURS).map((language) => (
        <button
          key={language}
          style={{ font: "11px system-ui", fontWeight: props.value === language ? 700 : 400 }}
          onClick={() => props.commit(language)}
        >
          {language}
        </button>
      ))}
      <button style={{ font: "11px system-ui" }} onClick={props.cancel}>✕</button>
    </span>
  );
}

const isLanguage = ({ column }: { column: unknown }) =>
  (column as { attr?: string } | null)?.attr === "language";

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);

  return (
    <>
      <div className="demo-bar">
        <button onClick={() => viewer.current?.openTable()}>Open the table</button>
        Double-click a language.
      </div>
      <div style={{ height: 520 }}>
        <TopologyViewer
          ref={viewer}
          data={services}
          parts={{
            // How a cell shows.
            "table-cell": {
              match: isLanguage,
              render: ({ value }: { value: unknown }) =>
                value === undefined ? null : (
                  <span style={{ color: COLOURS[String(value)], fontWeight: 600 }}>
                    ● {String(value)}
                  </span>
                ),
            },
            // How a cell edits.
            "cell-editor": {
              match: isLanguage,
              render: ({ value, commit, cancel }: {
                value: unknown;
                commit: (value: unknown) => void;
                cancel: () => void;
              }) => <LanguagePicker value={value} commit={commit} cancel={cancel} />,
            },
            // Your own bulk action on the ticked rows.
            "bulk-bar": {
              after: ({ rows }: { rows: readonly unknown[] }) => (
                <button style={{ font: "11px system-ui" }} onClick={() => alert(rows.length + " rows")}>
                  Export {rows.length}
                </button>
              ),
            },
          }}
        />
      </div>
    </>
  );
}

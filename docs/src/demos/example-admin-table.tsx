import { useEffect, useRef, useState } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";

const graph = {
  nodes: [
    { id: "u1", type: "user", label: "Ana", attrs: { role: "Admin", active: true, seats: 5 } },
    { id: "u2", type: "user", label: "Bo", attrs: { role: "Editor", active: true, seats: 2 } },
    { id: "u3", type: "user", label: "Cy", attrs: { role: "Viewer", active: false, seats: 1 } },
    { id: "u4", type: "user", label: "Di", attrs: { role: "Editor", active: true, seats: 1 } },
    { id: "t1", type: "team", label: "Platform" },
  ],
  edges: [
    { source: "t1", target: "u1", predicate: "contains" },
    { source: "t1", target: "u2", predicate: "contains" },
    { source: "t1", target: "u3", predicate: "contains" },
    { source: "t1", target: "u4", predicate: "contains" },
  ],
  view: { approach: "passive", budget: "all", layout: "tree-v" },
};

type Bar = {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  save: () => void;
  cancel: () => void;
};

// The change bar, as your own form footer.
function SubmitBar({ dirty, saving, error, save, cancel }: Bar) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 12px",
        font: "12px system-ui",
        borderTop: "1px solid #d4d4d8",
        background: dirty ? "#fef9c3" : "transparent",
        color: "#0f172a",
      }}
    >
      <span style={{ flex: 1 }}>
        {error ?? (saving ? "Submitting…" : dirty ? "You have unsaved changes." : "All changes saved.")}
      </span>
      <button disabled={!dirty || saving} onClick={cancel}>Discard</button>
      <button disabled={!dirty || saving} onClick={save}>Submit to backend</button>
    </div>
  );
}

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);
  const [sent, setSent] = useState("Nothing sent yet.");

  useEffect(() => {
    // Start with the table as the whole view: this is a form.
    const timer = setTimeout(() => viewer.current?.openTable(), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div style={{ height: 680 }}>
        <TopologyViewer
          ref={viewer}
          data={graph}
          onSave={async (changes) => {
            await new Promise((done) => setTimeout(done, 600));
            setSent(JSON.stringify(changes, null, 2));
          }}
          parts={{
            table: {
              options: {
                columnsOnly: true,
                columns: [
                  { core: "name", label: "User" },
                  { attr: "role", label: "Role", editor: { select: ["Admin", "Editor", "Viewer"] } },
                  { attr: "active", label: "Active", editor: "boolean" },
                  { attr: "seats", label: "Seats", editor: "number" },
                ],
                validate: ({ column, value }: { column: unknown; value: unknown }) =>
                  (column as { attr?: string } | null)?.attr === "seats" && Number(value) > 10
                    ? "The plan allows 10 seats."
                    : undefined,
              },
            },
            "change-bar": { render: (bar: Bar) => <SubmitBar {...bar} /> },
            "table-filters": { hidden: true },
            "workbench-toolbar": { items: ["table-count", "spacer", "table-search"] },
          }}
        />
      </div>
      <pre className="demo-log">{sent}</pre>
    </>
  );
}

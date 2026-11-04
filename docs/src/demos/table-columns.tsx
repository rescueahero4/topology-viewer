import { useRef } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import services from "./data/services.json";

type Row = { kind: string; label?: string; attrs: { replicas?: number } };

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);

  return (
    <>
      <div className="demo-bar">
        <button onClick={() => viewer.current?.openTable()}>Open the table</button>
        Double-click a cell to edit it.
      </div>
      <div style={{ height: 520 }}>
        <TopologyViewer
          ref={viewer}
          data={services}
          parts={{
            table: {
              options: {
                columnsOnly: true,
                columns: [
                  { core: "name", label: "Service" },
                  { core: "id", editable: false },
                  {
                    attr: "language",
                    label: "Language",
                    editor: { select: ["Go", "Rust", "Kotlin", "Node"], message: "Pick a language." },
                  },
                  { attr: "replicas", label: "Replicas", editor: "number" },
                  // A column that you work out. It is read only.
                  {
                    attr: "size",
                    label: "Size",
                    value: (row: Row) => ((row.attrs.replicas ?? 0) >= 4 ? "Large" : "Small"),
                  },
                ],
                validate: ({ column, value }: { column: unknown; value: unknown }) =>
                  column === "name" && value === "" ? "A service needs a name." : undefined,
              },
            },
            "table-filters": { options: { show: { rowType: false, families: false } } },
          }}
        />
      </div>
    </>
  );
}

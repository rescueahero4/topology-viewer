import { qdicProfile } from "topology-viewer/profiles/qdic";
import { TopologyViewer } from "topology-viewer/react";
import catalog from "./data/catalog.json";

// A data catalog of 198 nodes, with its own vocabulary and icons from a profile.
export default function Demo() {
  return (
    <div style={{ height: 620 }}>
      <TopologyViewer
        data={catalog}
        profile={qdicProfile}
        parts={{
          search: { options: { placeholder: "Search tables, columns, people…", limit: 12 } },
          "layout-menu": { options: { default: "tree-h" } },
        }}
      />
    </div>
  );
}

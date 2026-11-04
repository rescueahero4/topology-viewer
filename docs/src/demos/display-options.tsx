import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <div style={{ height: 480 }}>
      <TopologyViewer
        data={services}
        parts={{
          "scope-menu": { options: { budgets: [3, 6, 12, "all"] } },
          "layout-menu": {
            options: { layouts: ["force", "tree-h", "tree-v"], default: "tree-h" },
          },
          "grouping-menu": { options: { values: [3, 8, "off"], default: "off" } },
          // Reorder, leave out, or add your own.
          "display-options": {
            items: ["layout-menu", "scope-menu", "grouping-menu", "dataset-button"],
          },
        }}
      />
    </div>
  );
}

import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

type Node = { attrs: { language?: string; replicas?: number } };

export default function Demo() {
  return (
    <div style={{ height: 460 }}>
      <TopologyViewer
        data={services}
        parts={{
          filters: {
            options: {
              // Your own filters show as pills next to the others.
              custom: [
                {
                  id: "go",
                  label: "Written in Go",
                  test: (node: Node) => node.attrs.language === "Go",
                },
                {
                  id: "scaled",
                  label: "3+ replicas",
                  test: (node: Node) => (node.attrs.replicas ?? 0) >= 3,
                },
              ],
              // Starts off, with its pill still there.
              off: ["publishes"],
            },
          },
          // No Ownership tab at all.
          "filter-families": { options: { hidden: ["Ownership"] } },
        }}
      />
    </div>
  );
}

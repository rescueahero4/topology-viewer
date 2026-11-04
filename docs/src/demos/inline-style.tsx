import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <div style={{ height: 480 }}>
      <TopologyViewer
        data={services}
        parts={{
          // An inline style on one part.
          "display-options": { style: { borderRadius: 24, paddingInline: 12 } },
          // Or a function of its state.
          "family-tab": {
            style: ({ pressed }) => ({ opacity: pressed ? 1 : 0.35 }),
          },
          // On the canvas, the function gets the data of the node or the edge.
          node: {
            style: (node: { attrs: { replicas?: number } }) =>
              node.attrs.replicas !== undefined && node.attrs.replicas >= 4
                ? { filter: "drop-shadow(0 0 6px #f59e0b)" }
                : undefined,
          },
          edge: {
            style: (edge: { label: string }) =>
              edge.label === "owns" ? { strokeDasharray: "2 4" } : undefined,
          },
        }}
      />
    </div>
  );
}

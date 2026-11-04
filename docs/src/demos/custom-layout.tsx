import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <div style={{ height: 460 }}>
      <TopologyViewer
        data={services}
        // A pure function: the same graph gives the same places.
        layouts={{
          ring: {
            label: "Ring",
            run: ({ nodes }) =>
              Object.fromEntries(
                nodes.map((node, at) => {
                  const angle = (at / nodes.length) * 2 * Math.PI;
                  return [node.id, { x: 240 * Math.cos(angle), y: 240 * Math.sin(angle) }];
                }),
              ),
          },
        }}
        parts={{
          "layout-menu": { options: { layouts: ["force", "tree-h"] } },
        }}
      />
    </div>
  );
}

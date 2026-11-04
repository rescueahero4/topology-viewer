import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

type Node = { label: string; attrs: { language?: string; replicas?: number } };

export default function Demo() {
  return (
    <div style={{ height: 440 }}>
      <TopologyViewer
        data={services}
        parts={{
          node: {
            options: {
              label: (node: Node) => node.label.toUpperCase(),
              sublabel: (node: Node) =>
                node.attrs.language === undefined
                  ? undefined
                  : `${node.attrs.language} · ${node.attrs.replicas} replicas`,
            },
          },
          // Your own tooltip, for nodes and for edges.
          tooltip: {
            render: ({ kind, node, edge }: {
              kind: "node" | "edge";
              node?: Node;
              edge?: { label: string };
            }) => (
              <div style={{ padding: "4px 8px", font: "12px system-ui" }}>
                {kind === "node" ? "🔎 " + node?.label : "🔗 " + edge?.label}
              </div>
            ),
          },
        }}
      />
    </div>
  );
}

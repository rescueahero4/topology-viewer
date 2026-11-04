import { useState } from "react";
import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

type Node = {
  id: string;
  label: string;
  type: string | null;
  attrs: { language?: string; replicas?: number };
};

function ServiceCard({ node, selected }: { node: Node; selected: boolean }) {
  const [replicas, setReplicas] = useState(node.attrs.replicas ?? 1);
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: 170,
        height: 58,
        padding: "6px 10px",
        borderRadius: 10,
        font: "12px system-ui",
        color: "#0f172a",
        background: selected ? "#fef3c7" : "#fff",
        border: "1.5px solid " + (selected ? "#f59e0b" : "#cbd5e1"),
        boxShadow: "0 2px 6px rgb(0 0 0 / .12)",
      }}
    >
      <strong>{node.label}</strong>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ color: "#64748b" }}>{node.attrs.language}</span>
        {/* A press on a control belongs to the control. It does not select or drag. */}
        <button style={{ font: "11px system-ui" }} onClick={() => setReplicas(replicas + 1)}>
          {replicas} replicas +
        </button>
      </div>
    </div>
  );
}

export default function Demo() {
  return (
    <div style={{ height: 520 }}>
      <TopologyViewer
        data={services}
        parts={{
          node: {
            // Only the services. Other types keep their default mark.
            match: ({ node }: { node: Node }) => node.type === "service",
            // The layout makes room by this size.
            options: { sizes: { service: { width: 170, height: 58 } } },
            render: ({ node, selected }: { node: Node; selected: boolean }) => (
              <ServiceCard node={node} selected={selected} />
            ),
          },
        }}
      />
    </div>
  );
}

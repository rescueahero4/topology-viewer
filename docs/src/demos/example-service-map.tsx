import { useRef, useState } from "react";
import { createTopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import services from "./data/services.json";

type Node = {
  id: string;
  label: string;
  type: string | null;
  attrs: { language?: string; replicas?: number };
};

// Live health, as your monitoring API might give it.
const HEALTH: Record<string, "ok" | "slow" | "down"> = {
  gw: "ok", orders: "slow", pay: "ok", ship: "down", mail: "ok",
};
const COLOUR = { ok: "#16a34a", slow: "#d97706", down: "#dc2626" };

function ServiceCard({ node, selected }: { node: Node; selected: boolean }) {
  const health = HEALTH[node.id] ?? "ok";
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: 150,
        height: 52,
        padding: "6px 10px",
        font: "12px system-ui",
        color: "#0f172a",
        background: "#fff",
        borderRadius: 8,
        borderLeft: "5px solid " + COLOUR[health],
        outline: selected ? "2px solid #4f46e5" : "none",
        boxShadow: "0 1px 4px rgb(0 0 0 / .2)",
      }}
    >
      <strong>{node.label}</strong>
      <div style={{ color: COLOUR[health] }}>
        {health} · {node.attrs.replicas} replicas
      </div>
    </div>
  );
}

const ServiceMap = createTopologyViewer({
  parts: {
    node: {
      match: ({ node }: { node: Node }) => node.type === "service",
      options: { sizes: { service: { width: 150, height: 52 } } },
      render: ({ node, selected }: { node: Node; selected: boolean }) => (
        <ServiceCard node={node} selected={selected} />
      ),
    },
    filters: {
      options: {
        custom: [
          {
            id: "problems",
            label: "Only problems",
            test: (node: Node) => node.type !== "service" || HEALTH[node.id] !== "ok",
          },
        ],
      },
    },
    "inspector-attributes": {
      options: {
        fields: [
          { label: "Health", value: (node: Node) => HEALTH[node.id] ?? "unknown" },
          { key: "replicas", label: "Replicas" },
        ],
      },
    },
    "grouping-menu": { hidden: true },
  },
});

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);
  const [incident, setIncident] = useState(false);

  return (
    <>
      <div className="demo-bar">
        <button
          aria-pressed={incident}
          onClick={() => {
            setIncident(!incident);
            viewer.current?.setCustomFilter("problems", !incident);
          }}
        >
          Incident mode
        </button>
        <button onClick={() => viewer.current?.focus("ship")}>Go to Shipping</button>
      </div>
      <div style={{ height: 560 }}>
        <ServiceMap ref={viewer} data={services} />
      </div>
    </>
  );
}

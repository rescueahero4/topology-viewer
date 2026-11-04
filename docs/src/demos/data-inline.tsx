import { TopologyViewer } from "topology-viewer/react";

const graph = {
  nodes: [
    { id: "web", type: "app", label: "Web app", attrs: { team: "Growth" } },
    { id: "api", type: "service", label: "API", attrs: { language: "Go" } },
    { id: "db", type: "database", label: "Postgres" },
  ],
  edges: [
    { source: "web", target: "api", predicate: "dependsOn" },
    { source: "api", target: "db", predicate: "dependsOn" },
  ],
  // Optional: how each type looks.
  types: {
    app: { label: "App", shape: "square", color: "#7C3AED", abbr: "AP" },
    service: { label: "Service", shape: "hexagon", color: "#2563EB", abbr: "SV" },
    database: { label: "Database", shape: "circle", color: "#059669", abbr: "DB" },
  },
  // Optional: what shows first.
  view: { approach: "passive", budget: "all", layout: "tree-h" },
};

export default function Demo() {
  return (
    <div style={{ height: 380 }}>
      <TopologyViewer data={graph} />
    </div>
  );
}

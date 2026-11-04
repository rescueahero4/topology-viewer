import { defineProfile, TopologyViewer } from "topology-viewer/react";

const robot = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="8" width="16" height="12" rx="2" stroke="#7c3aed" stroke-width="2" />
    <path d="M12 8V4" stroke="#7c3aed" stroke-width="2" />
    <circle cx="9" cy="14" r="1.5" fill="#7c3aed" />
    <circle cx="15" cy="14" r="1.5" fill="#7c3aed" />
  </svg>
`;

const profile = defineProfile({
  families: ["Control"],
  nodeTypes: {
    // With your own SVG.
    robot: { label: "Robot", category: "Machines", icon: robot, color: "#7c3aed" },
    // With a drawn mark: a colour, a size rank and two letters.
    person: { label: "Person", category: "People", color: "#0891b2", rank: 3, abbr: "PE" },
  },
  predicates: {
    drives: { family: "Control", inverse: "drivenBy" },
  },
});

const graph = {
  nodes: [
    { id: "luke", type: "person", label: "Luke" },
    { id: "r2", type: "robot", label: "R2-D2" },
    { id: "c3", type: "robot", label: "C-3PO" },
  ],
  edges: [
    { source: "luke", target: "r2", predicate: "drives" },
    { source: "luke", target: "c3", predicate: "drives" },
  ],
  view: { approach: "passive", budget: "all" },
};

export default function Demo() {
  return (
    <div style={{ height: 480 }}>
      <TopologyViewer
        data={graph}
        profile={profile}
        familyLooks={{
          Control: { main: "#dc2626", tint: "#fee2e2", border: "#fca5a5" },
        }}
      />
    </div>
  );
}

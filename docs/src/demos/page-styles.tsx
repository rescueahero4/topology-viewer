import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

// Stands in for your Tailwind build: utilities in the "utilities" layer.
const css = `
  @layer utilities {
    .bg-amber { background-color: #fde68a; color: #78350f; }
    .underline-red { color: #dc2626; text-decoration: underline; }
  }
`;

export default function Demo() {
  return (
    <>
      <style>{css}</style>
      <div style={{ height: 440 }}>
        <TopologyViewer
          data={services}
          pageStyles
          parts={{
            "family-tab": { className: "bg-amber" },
            "search-tools": { className: "bg-amber" },
          }}
        />
      </div>
    </>
  );
}

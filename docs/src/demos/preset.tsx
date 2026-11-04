import { createTopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

// viewer.ts: your project's viewer, in one place.
const CompanyViewer = createTopologyViewer({
  theme: { frameRadius: "12px", accent: "#0d9488", focus: "#0d9488" },
  parts: {
    "grouping-menu": { hidden: true },
    "scope-menu": { options: { budgets: [5, 10, "all"] } },
  },
});

// Anywhere in your project. Props win over the preset, and parts merge by name.
export default function Demo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 8 }}>
      <div style={{ height: 480 }}>
        <CompanyViewer data={services} />
      </div>
      <div style={{ height: 480 }}>
        <CompanyViewer
          data={services}
          theme={{ accent: "#db2777", frameRadius: "0" }}
          parts={{ "grouping-menu": { hidden: false } }}
        />
      </div>
    </div>
  );
}

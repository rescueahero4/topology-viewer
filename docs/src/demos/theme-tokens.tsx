import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <div style={{ height: 440, padding: 12 }}>
      <TopologyViewer
        data={services}
        theme={{
          frameRadius: "16px",
          frameBorder: "2px solid #7c3aed",
          radius: "10px",
          radiusSm: "8px",
          font: "Georgia, serif",
          accent: "#7c3aed",
          focus: "#7c3aed",
        }}
      />
    </div>
  );
}

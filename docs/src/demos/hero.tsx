import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <div style={{ height: 560 }}>
      <TopologyViewer data={services} />
    </div>
  );
}

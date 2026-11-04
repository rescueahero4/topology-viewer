import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <div style={{ height: 480 }}>
      <TopologyViewer data={services} />
    </div>
  );
}

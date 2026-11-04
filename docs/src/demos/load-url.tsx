import { TopologyViewer } from "topology-viewer/react";

// A GET that answers with the graph as JSON.
const url = `${import.meta.env.BASE_URL}/api/services.json`;

export default function Demo() {
  return (
    <div style={{ height: 480 }}>
      <TopologyViewer url={url} />
    </div>
  );
}

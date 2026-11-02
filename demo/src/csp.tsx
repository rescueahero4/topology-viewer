import { createRoot } from "react-dom/client";
import { TopologyViewer } from "topology-viewer/react";

createRoot(document.getElementById("root") as HTMLElement).render(
  <TopologyViewer
    className="a"
    style={{ height: 600 }}
    url="http://127.0.0.1:4600/api/graphs/catalog"
    variant="page"
  />,
);

import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  return (
    <>
      <div className="demo-bar">
        Hover the viewer, then try Ctrl or Cmd + K for the search, and Ctrl or Cmd + J for the table.
        The / key does nothing here.
      </div>
      <div style={{ height: 400 }}>
        <TopologyViewer
          data={services}
          keyboard={{ search: "mod+k", toggleTable: "mod+j", tableLarger: false, tableSmaller: false }}
        />
      </div>
    </>
  );
}

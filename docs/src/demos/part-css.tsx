import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

// Plain CSS on the page. ::part reaches into the viewer by the public name of an element.
const css = `
  .my-viewer::part(viewer-frame) { border: 3px dashed #ec4899; border-radius: 0; }
  .my-viewer::part(family-tab) { font-style: italic; }
  .my-viewer::part(family-tab pressed) { text-decoration: underline; }
  .my-viewer::part(node-label) { font-weight: 800; }
  .my-viewer::part(edge) { stroke-width: 3px; }
`;

export default function Demo() {
  return (
    <>
      <style>{css}</style>
      <div style={{ height: 480 }}>
        <TopologyViewer className="my-viewer" data={services} />
      </div>
    </>
  );
}

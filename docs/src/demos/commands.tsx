import { useRef, useState } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);
  const [state, setState] = useState("");

  return (
    <>
      <div className="demo-bar">
        <button onClick={() => viewer.current?.focus("orders")}>focus("orders")</button>
        <button onClick={() => viewer.current?.setLayout("tree-v")}>setLayout("tree-v")</button>
        <button onClick={() => viewer.current?.toggleTable()}>toggleTable()</button>
        <button onClick={() => viewer.current?.setSearch("kaf")}>setSearch("kaf")</button>
        <button onClick={() => viewer.current?.hide(["redis"])}>hide(["redis"])</button>
        <button onClick={() => viewer.current?.fit()}>fit()</button>
      </div>
      <div style={{ height: 480 }}>
        <TopologyViewer
          ref={viewer}
          data={services}
          onStateChange={(next) =>
            setState(
              JSON.stringify(
                {
                  selection: next.selection,
                  layout: next.layout,
                  tableOpen: next.table.open,
                  search: next.search,
                },
                null,
                2,
              ),
            )
          }
        />
      </div>
      <pre className="demo-log">{state}</pre>
    </>
  );
}

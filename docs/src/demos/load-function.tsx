import { useRef, useState } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";

const url = `${import.meta.env.BASE_URL}/api/services.json`;

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);
  const [fail, setFail] = useState(false);

  return (
    <>
      <div className="demo-bar">
        <button aria-pressed={fail} onClick={() => setFail(!fail)}>
          Make the next load fail
        </button>
        <button onClick={() => viewer.current?.reload()}>Reload</button>
      </div>
      <div style={{ height: 420 }}>
        <TopologyViewer
          ref={viewer}
          // Use load for headers, auth, or an API that wraps its answer.
          load={async (signal) => {
            const answer = await fetch(url, {
              signal,
              headers: { authorization: "Bearer demo-token" },
            });
            if (fail) throw new Error("The API said no");
            // Your API might answer { result: { graph } }. Return only the graph.
            return answer.json();
          }}
        />
      </div>
    </>
  );
}

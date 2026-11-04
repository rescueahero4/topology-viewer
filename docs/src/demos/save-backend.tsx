import { useRef, useState } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import services from "./data/services.json";

type Mode = "works" | "says no" | "is down";

export default function Demo() {
  const viewer = useRef<TopologyViewerRef>(null);
  const [mode, setMode] = useState<Mode>("works");
  const [log, setLog] = useState<string[]>([]);

  return (
    <>
      <div className="demo-bar">
        <button onClick={() => viewer.current?.openTable()}>Open the table</button>
        The backend:
        {(["works", "says no", "is down"] as const).map((one) => (
          <button key={one} aria-pressed={mode === one} onClick={() => setMode(one)}>
            {one}
          </button>
        ))}
      </div>
      <div style={{ height: 480 }}>
        <TopologyViewer
          ref={viewer}
          data={services}
          onSave={async (changes) => {
            // changes holds only what is new since the last save.
            setLog((all) => ["PATCH /graph " + JSON.stringify(changes), ...all]);
            await new Promise((done) => setTimeout(done, 800));

            // Your text shows in the bar, and the edits stay.
            if (mode === "says no") return { error: "Orders is locked by Ana." };
            // A thrown error also keeps the edits, with a general message.
            if (mode === "is down") throw new Error("503 from the server");
          }}
        />
      </div>
      <pre className="demo-log">{log.join("\n") || "Edit a cell, then press Save changes."}</pre>
    </>
  );
}

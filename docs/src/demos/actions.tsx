import { useState } from "react";
import { TopologyViewer, type TopologyEvent } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  const [log, setLog] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const note = (line: string) => setLog((all) => [line, ...all].slice(0, 30));

  return (
    <>
      <div className="demo-bar">
        <button aria-pressed={locked} onClick={() => setLocked(!locked)}>
          Lock the filters
        </button>
        Press anything in the viewer.
      </div>
      <div style={{ height: 420 }}>
        <TopologyViewer
          data={services}
          // Every action of every control, before it runs.
          onAction={(event: TopologyEvent) => {
            if (event.type !== "press")
              note(event.type + " from " + event.part + " " + JSON.stringify(event.args));
          }}
          parts={{
            "filter-families": {
              on: {
                toggleFamily: (event: TopologyEvent) => {
                  if (locked) {
                    note("stopped " + event.type);
                    event.preventDefault();
                  }
                },
              },
            },
            node: {
              on: {
                activate: (event: TopologyEvent) => note("double press on " + event.id),
              },
            },
          }}
        />
      </div>
      <pre className="demo-log">{log.join("\n")}</pre>
    </>
  );
}

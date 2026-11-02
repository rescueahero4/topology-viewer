import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { qdicProfile } from "topology-viewer/profiles/qdic";
import { TopologyViewer } from "topology-viewer/react";

const API = "http://127.0.0.1:4600/api/graphs";

function App() {
  const [graphs, setGraphs] = useState<string[]>([]);
  const [graph, setGraph] = useState("catalog");
  const [qdic, setQdic] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((lines) => [line, ...lines].slice(0, 50));

  useEffect(() => {
    fetch(API)
      .then((answer) => answer.json() as Promise<string[]>)
      .then(setGraphs)
      .catch(() => note("The mock API is not running."));
  }, []);

  return (
    <div className="page">
      <div className="bar">
        <h1>topology-viewer demo</h1>
        <select value={graph} onChange={(event) => setGraph(event.target.value)}>
          {graphs.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={qdic}
            onChange={(event) => setQdic(event.target.checked)}
          />{" "}
          QDIC vocabulary
        </label>
        <code>
          {API}/{graph}
        </code>
      </div>
      <div className="main">
        <div className="graph">
          {/* The profile is read at mount, so a new key mounts a new viewer. */}
          <TopologyViewer
            key={String(qdic)}
            url={`${API}/${graph}`}
            {...(qdic ? { profile: qdicProfile } : {})}
            onError={(error) => note(`load failed: ${error.message}`)}
            onSelect={(selection) =>
              note(`select ${JSON.stringify(selection)?.slice(0, 160)}`)
            }
            onSave={(changes) => note(`save ${JSON.stringify(changes).slice(0, 200)}`)}
          />
        </div>
        <div className="log">{log.join("\n")}</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

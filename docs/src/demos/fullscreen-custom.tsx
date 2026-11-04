import { useState } from "react";
import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  // Your state decides. The viewer asks, and you answer through the prop.
  const [mode, setMode] = useState<"inline" | "fullscreen">("inline");
  const [asks, setAsks] = useState(0);

  return (
    <>
      <div className="demo-bar">
        <button onClick={() => setMode(mode === "inline" ? "fullscreen" : "inline")}>
          {mode === "inline" ? "Go full" : "Leave full"}
        </button>
        The viewer asked {asks} times. This demo ignores it.
      </div>
      <div style={{ height: 480 }}>
        <TopologyViewer
          data={services}
          displayMode={mode}
          onDisplayModeChange={() => setAsks((n) => n + 1)}
          parts={{
            "fullscreen-button": {
              // Your own button, with the same action.
              render: ({ toggle, displayMode }: {
                toggle: () => void;
                displayMode: string;
              }) => (
                <button style={{ font: "11px system-ui" }} onClick={toggle}>
                  {displayMode === "inline" ? "⤢ Expand" : "⤡ Shrink"}
                </button>
              ),
            },
          }}
        />
      </div>
    </>
  );
}

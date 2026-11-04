import { useState } from "react";
import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

export default function Demo() {
  const [how, setHow] = useState<"viewport" | "native" | "off">("viewport");

  return (
    <>
      <div className="demo-bar">
        {(["viewport", "native", "off"] as const).map((one) => (
          <button key={one} aria-pressed={how === one} onClick={() => setHow(one)}>
            {one}
          </button>
        ))}
        Then press the button next to the search. Escape closes it.
      </div>
      <div style={{ height: 420 }}>
        <TopologyViewer
          key={how}
          data={services}
          fullscreen={how === "off" ? false : how}
        />
      </div>
    </>
  );
}

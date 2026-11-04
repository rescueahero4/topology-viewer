import { useState } from "react";
import { TopologyViewer } from "topology-viewer/react";
import { DARK_THEME } from "./data/dark-theme";
import services from "./data/services.json";

export default function Demo() {
  const [mode, setMode] = useState("dark");

  return (
    <>
      <div className="demo-bar">
        <button aria-pressed={mode === "light"} onClick={() => setMode("light")}>Light</button>
        <button aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>Dark</button>
        <button aria-pressed={mode === "system"} onClick={() => setMode("system")}>System</button>
      </div>
      <div style={{ height: 440 }}>
        <TopologyViewer data={services} themes={{ dark: DARK_THEME }} colorMode={mode} />
      </div>
    </>
  );
}

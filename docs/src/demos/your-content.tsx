import { createContext, useContext } from "react";
import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

// Your own React context works inside the viewer.
const Company = createContext("no provider");

function Owner({ name }: { name?: string }) {
  const company = useContext(Company);
  return (
    <div style={{ padding: "8px 12px", borderTop: "1px solid var(--tv-border, #e4e4e7)" }}>
      <strong>{name}</strong> is run by {company}.
    </div>
  );
}

const Badge = ({ text }: { text: string }) => (
  <span style={{ fontSize: 9, color: "#7c3aed", marginInlineEnd: 4 }}>{text}</span>
);

export default function Demo() {
  return (
    <Company.Provider value="Acme, from your context">
      <div style={{ height: 480 }}>
        <TopologyViewer
          data={services}
          parts={{
            // Replace a part.
            "inspector-notes": {
              render: ({ node }: { node: { label: string } | null }) => (
                <Owner name={node?.label} />
              ),
            },
            // Add around a part.
            "triple-row": {
              before: ({ triple }: { triple: { direction: string } }) => (
                <Badge text={triple.direction} />
              ),
            },
            // Order the children of a container, and add your own.
            "display-options": {
              items: [
                "layout-menu",
                "scope-menu",
                {
                  id: "fit",
                  render: ({ commands }: { commands: { fit(): void } }) => (
                    <button onClick={() => commands.fit()}>Fit</button>
                  ),
                },
              ],
            },
            // Add over the canvas.
            canvas: {
              after: () => (
                <div style={{ position: "absolute", top: 56, right: 12, fontSize: 11 }}>
                  My legend
                </div>
              ),
            },
          }}
        />
      </div>
    </Company.Provider>
  );
}

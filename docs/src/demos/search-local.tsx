import { useState } from "react";
import { TopologyViewer, type TopologyEvent } from "topology-viewer/react";
import services from "./data/services.json";

type Node = { label: string; attrs: { language?: string } };

export default function Demo() {
  const [picked, setPicked] = useState("nothing yet");

  return (
    <>
      <div className="demo-bar">Try "go" or "rust". Picked: {picked}</div>
      <div style={{ height: 420 }}>
        <TopologyViewer
          data={services}
          keyboard={{ search: "mod+k" }}
          parts={{
            search: {
              options: {
                placeholder: "Search by language",
                debounce: 100,
                limit: 3,
                match: (node: Node, query: string) =>
                  node.attrs.language?.toLowerCase().includes(query.toLowerCase()) === true,
              },
              on: {
                pick: (event: TopologyEvent) => {
                  setPicked(String(event.id));
                  // Stop here to navigate instead of focusing the node.
                  // event.preventDefault();
                },
              },
            },
            "search-result": {
              render: ({ node }: { node: Node | null }) => (
                <span>
                  {node?.label} <em style={{ opacity: 0.6 }}>{node?.attrs.language}</em>
                </span>
              ),
            },
          }}
        />
      </div>
    </>
  );
}

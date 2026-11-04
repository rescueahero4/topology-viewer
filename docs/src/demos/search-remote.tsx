import { TopologyViewer } from "topology-viewer/react";
import services from "./data/services.json";

// Stands in for your search API.
async function searchApi(query: string, signal: AbortSignal): Promise<string[]> {
  await new Promise((done) => setTimeout(done, 400));
  signal.throwIfAborted();
  if (query.includes("fail")) throw new Error("The search API is down");
  return services.nodes
    .filter((node) => node.label.toLowerCase().includes(query.toLowerCase()))
    .map((node) => node.id);
}

export default function Demo() {
  return (
    <div style={{ height: 420 }}>
      <TopologyViewer
        data={services}
        parts={{
          search: {
            options: {
              placeholder: 'Try "order", or "fail"',
              minLength: 2,
              // Returns the ids of the hits. A new query cancels the last one.
              source: searchApi,
            },
          },
        }}
      />
    </div>
  );
}

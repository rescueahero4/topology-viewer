import { TopologyViewer } from "topology-viewer/react";

// What your backend sends: names that make sense to it.
const graph = {
  nodes: [
    {
      id: "a",
      type: "service",
      label: "Orders",
      attrs: {
        owner_email: "ana@example.com",
        cost_usd: 1240,
        internal_etag: "9f3a",
        tier: 1,
      },
    },
    { id: "b", type: "service", label: "Payments", attrs: { owner_email: "bo@example.com", cost_usd: 310 } },
  ],
  edges: [{ source: "a", target: "b", predicate: "dependsOn" }],
  // Starts from Orders, with it selected.
  view: { root: "a", budget: "all" },
};

type Node = { attrs: { owner_email?: string } };

export default function Demo() {
  return (
    <div style={{ height: 440 }}>
      <TopologyViewer
        data={graph}
        parts={{
          "inspector-attributes": {
            options: {
              fields: [
                // Rename a field.
                { key: "owner_email", label: "Owner" },
                // Format a field.
                { key: "cost_usd", label: "Monthly cost", format: (value: unknown) => "$" + value },
                // Hide a field.
                { key: "internal_etag", hidden: true },
                // Add a field that you work out.
                {
                  label: "Team",
                  value: (node: Node) => node.attrs.owner_email?.split("@")[1],
                },
              ],
            },
          },
          // The order of the sections, and the links that show.
          "inspector-body": { items: ["inspector-attributes", "inspector-triples"] },
          "inspector-triples": { options: { tabs: false } },
        }}
      />
    </div>
  );
}

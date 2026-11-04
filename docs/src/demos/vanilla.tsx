import { useEffect, useRef } from "react";
import { mountTopology } from "topology-viewer";
import services from "./data/services.json";

export default function Demo() {
  const host = useRef<HTMLDivElement>(null);

  // This useEffect only gives us an element. The code in it works in any framework or none.
  useEffect(() => {
    const viewer = mountTopology(host.current as HTMLDivElement, {
      data: services,
      theme: { accent: "#0d9488" },
      onSelect: (selection) => console.log(selection),
      parts: {
        "inspector-notes": {
          // Without React: you get an element, and can return a cleanup.
          render: (context: { node: { label: string } | null }, element: HTMLElement) => {
            element.textContent = "Notes of " + context.node?.label;
            element.style.padding = "8px 12px";
          },
        },
      },
    });
    viewer.commands.focus("gw");
    return () => viewer.destroy();
  }, []);

  return <div ref={host} style={{ height: 440 }} />;
}

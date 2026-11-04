import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import { qdicProfile } from "topology-viewer/profiles/qdic";
import { DARK_THEME } from "../demos/data/dark-theme";
import { useSiteTheme } from "./siteTheme";

// The showcase of the home page: the code first, then the viewer that it describes, and controls under
// the viewer. Each control changes the props of the real component, and the code follows.

type Graph = {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  view?: Record<string, unknown>;
  [key: string]: unknown;
};

const SAMPLES = [
  { id: "services", label: "Microservices", qdic: false },
  { id: "extend", label: "Business glossary", qdic: true },
  { id: "governance", label: "Data governance", qdic: true },
  { id: "catalog", label: "Data catalog (198 nodes)", qdic: true },
  { id: "access", label: "Access model (large)", qdic: true },
] as const;
type Sample = (typeof SAMPLES)[number]["id"];

const LAYOUTS = [
  ["force", "Force"],
  ["atomic", "Atomic"],
  ["bubbles", "Bubbles"],
  ["tree-h", "Tree, horizontal"],
  ["tree-v", "Tree, vertical"],
] as const;
type Layout = (typeof LAYOUTS)[number][0];

const load = async (sample: Sample): Promise<Graph> => {
  const answer = await fetch(`${import.meta.env.BASE_URL}/api/${sample}.json`);
  const graph = (await answer.json()) as Graph;
  // The layout comes from the control here, and a view in the payload would win over it.
  const { layout: _, ...view } = graph.view ?? {};
  return { ...graph, view: { approach: "passive", ...view } };
};

// ---- The mutations: each one makes a new payload, as a new answer from an API does.

const endsOf = (edge: Record<string, unknown>) => [
  edge.source ?? edge.subject,
  edge.target ?? edge.object,
];

let made = 0;

function addNode(graph: Graph, near: string | null): { graph: Graph; id: string } {
  made += 1;
  const id = `new-${made}`;
  const anchor = near ?? (graph.nodes[0]?.id as string | undefined);
  return {
    id,
    graph: {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id, type: graph.nodes[0]?.type ?? "service", label: `New node ${made}`, attrs: { added: "by the demo" } },
      ],
      edges:
        anchor === undefined
          ? graph.edges
          : [...graph.edges, { source: anchor, target: id, predicate: "dependsOn" }],
    },
  };
}

function addEdge(graph: Graph, from: string | null): Graph {
  const ids = graph.nodes.map((node) => node.id as string);
  const source = from ?? ids[0];
  const linked = new Set(
    graph.edges.flatMap((edge) => {
      const [a, b] = endsOf(edge);
      return a === source ? [b] : b === source ? [a] : [];
    }),
  );
  const target = ids.find((id) => id !== source && !linked.has(id));
  if (source === undefined || target === undefined) return graph;
  return { ...graph, edges: [...graph.edges, { source, target, predicate: "relatedTo" }] };
}

function rename(graph: Graph, id: string | null): Graph {
  const target = id ?? (graph.nodes[0]?.id as string | undefined);
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === target ? { ...node, label: `${String(node.label)} (renamed)` } : node,
    ),
  };
}

function removeNode(graph: Graph, id: string | null): Graph {
  const target = id ?? (graph.nodes.at(-1)?.id as string | undefined);
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== target),
    edges: graph.edges.filter((edge) => !endsOf(edge).includes(target)),
  };
}

// A bad payload shows a notice in the viewer. It does not throw, and no text in it becomes markup.
const breakData = (graph: Graph): Graph => ({
  ...graph,
  nodes: [
    ...graph.nodes,
    { id: "bad", type: "<img src=x onerror=alert(1)>", label: "<b>Not markup</b>" },
    { id: 42, label: "An id that is not text" },
  ],
  edges: [...graph.edges, { source: "bad", target: "no-such-node", predicate: "broken" }],
});

// ---- A custom node

type CardNode = { label: string; typeLabel: string };

function Card({ node, selected }: { node: CardNode; selected: boolean }) {
  return (
    <div className={selected ? "show-card show-card--on" : "show-card"}>
      <strong>{node.label}</strong>
      <span>{node.typeLabel}</span>
    </div>
  );
}

// ---- The code

type Options = {
  sample: Sample;
  qdic: boolean;
  layout: Layout;
  dark: boolean;
  cards: boolean;
};

function codeOf({ qdic, layout, dark, cards }: Options): string {
  const imports = [`import { TopologyViewer } from "topology-viewer/react";`];
  if (qdic) imports.push(`import { qdicProfile } from "topology-viewer/profiles/qdic";`);
  if (dark) imports.push(`import { darkTheme } from "./dark-theme";`);
  const parts = [];
  if (layout !== "force")
    parts.push(`"layout-menu": { options: { default: "${layout}" } },`);
  if (cards)
    parts.push(
      "node: {",
      "  options: { sizes: { service: { width: 140, height: 44 } } },",
      "  render: ({ node, selected }) => <Card node={node} selected={selected} />,",
      "},",
    );
  const props = [
    "data={graph}",
    ...(qdic ? ["profile={qdicProfile}"] : []),
    ...(dark ? ["themes={{ dark: darkTheme }}", 'colorMode="dark"'] : []),
    ...(parts.length > 0 ? ["parts={{", ...parts.map((one) => `  ${one}`), "}}"] : []),
    "onSelect={(selection) => console.log(selection)}",
    "onSave={(changes) => api.patch(changes)}",
  ];
  const indent = (lines: readonly string[], by: number) =>
    lines.map((one) => `${" ".repeat(by)}${one}`).join("\n");
  return `${imports.join("\n")}

export function Graph({ graph }) {
  return (
    <div style={{ height: 600 }}>
      <TopologyViewer
${indent(props, 8)}
      />
    </div>
  );
}`;
}

const JSON_LINES = 60;

function jsonOf(graph: Graph | null): string {
  if (graph === null) return "";
  const { nodes, edges, view } = graph;
  const small = {
    nodes: nodes.slice(-6),
    edges: edges.slice(-4),
    ...(view === undefined ? {} : { view }),
  };
  const text = JSON.stringify(small, null, 2).split("\n").slice(0, JSON_LINES).join("\n");
  return `// ${nodes.length} nodes and ${edges.length} edges. The last few of each:\n${text}`;
}

// A small highlighter, which builds text nodes and so needs no markup.
const TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|`[^`]*`)|\b(import|from|export|function|return|true|false|null)\b|(<\/?[A-Z]\w*|\/>)|(\b[a-zA-Z-]+(?==[{"]))|(\b\d+\b)/g;
const KINDS = ["com", "str", "key", "tag", "prop", "num"];

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const match of code.matchAll(TOKEN)) {
    if (match.index > at) out.push(code.slice(at, match.index));
    const kind = KINDS[match.slice(1).findIndex((one) => one !== undefined)];
    out.push(
      <span key={match.index} className={`hl-${kind}`}>
        {match[0]}
      </span>,
    );
    at = match.index + match[0].length;
  }
  out.push(code.slice(at));
  return out;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="show-copy"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1300);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function Showcase() {
  const siteTheme = useSiteTheme();
  const viewer = useRef<TopologyViewerRef>(null);
  const [sample, setSample] = useState<Sample>("services");
  const [graph, setGraph] = useState<Graph | null>(null);
  const [qdic, setQdic] = useState(false);
  const [layout, setLayout] = useState<Layout>("force");
  const [dark, setDark] = useState<boolean | null>(null);
  const [cards, setCards] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"code" | "data">("code");
  const [log, setLog] = useState<string[]>([]);
  const isDark = dark ?? siteTheme === "dark";

  const note = (line: string) => setLog((all) => [line, ...all].slice(0, 40));

  useEffect(() => {
    let live = true;
    setGraph(null);
    setSelected(null);
    void load(sample).then((next) => {
      if (live) setGraph(next);
    });
    return () => {
      live = false;
    };
  }, [sample]);

  const mutate = (name: string, next: Graph, focus?: string) => {
    setGraph(next);
    note(`data: ${name}. Now ${next.nodes.length} nodes, ${next.edges.length} edges.`);
    if (focus !== undefined) setTimeout(() => viewer.current?.focus(focus), 200);
  };

  const options: Options = { sample, qdic, layout, dark: isDark, cards };
  const code = useMemo(() => codeOf(options), [sample, qdic, layout, isDark, cards]);
  const json = useMemo(() => jsonOf(graph), [graph]);
  const shown = tab === "code" ? code : json;

  const parts = useMemo(() => {
    const types = [...new Set((graph?.nodes ?? []).map((node) => node.type as string))];
    return {
      "layout-menu": { options: { default: layout } },
      ...(cards
        ? {
            node: {
              options: {
                sizes: Object.fromEntries(types.map((type) => [type, { width: 140, height: 44 }])),
              },
              render: ({ node, selected: on }: { node: CardNode; selected: boolean }) => (
                <Card node={node} selected={on} />
              ),
            },
          }
        : {}),
    };
  }, [graph, layout, cards]);

  const has = graph !== null;

  return (
    <div className="show not-content" data-showcase>
      <figure className="show-code">
        <div className="show-code-bar">
          <div role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}>
              Graph.tsx
            </button>
            <button type="button" role="tab" aria-selected={tab === "data"} onClick={() => setTab("data")}>
              graph.json
            </button>
          </div>
          <span className="show-code-note">Follows the controls below</span>
          <CopyButton text={shown} />
        </div>
        <pre data-show-code={tab}>
          <code>{highlight(shown)}</code>
        </pre>
      </figure>

      <figure className="show-ui">
        <div className="show-stage" style={{ height: 600 }}>
          {has ? (
            <TopologyViewer
              // A profile and the size of a node are read when the viewer mounts.
              key={`${qdic}-${cards}`}
              data={graph}
              {...(qdic ? { profile: qdicProfile } : {})}
              themes={{ dark: DARK_THEME }}
              colorMode={isDark ? "dark" : "light"}
              parts={parts}
              ref={viewer}
              onSelect={(selection) => {
                setSelected(selection?.kind === "node" ? selection.id : null);
                if (selection !== null) note(`onSelect: ${JSON.stringify(selection).slice(0, 110)}`);
              }}
              onAction={(event) => {
                if (event.type !== "press" && event.type !== "select")
                  note(`onAction: ${event.type} from ${event.part ?? "code"}`);
              }}
              onSave={(changes) => note(`onSave: ${JSON.stringify(changes).slice(0, 140)}`)}
            />
          ) : (
            <div className="tv-demo-loading" style={{ height: "100%" }}>
              Loading the sample data…
            </div>
          )}
        </div>

        <div className="show-controls">
          <div className="show-group">
            <h3>Sample data</h3>
            <label>
              <span className="sr-only">Sample data</span>
              <select
                data-control="sample"
                value={sample}
                onChange={(event) => {
                  const next = event.currentTarget.value as Sample;
                  setSample(next);
                  setQdic(SAMPLES.find((one) => one.id === next)?.qdic ?? false);
                }}
              >
                {SAMPLES.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="show-check">
              <input
                type="checkbox"
                data-control="qdic"
                checked={qdic}
                onChange={(event) => setQdic(event.currentTarget.checked)}
              />
              Icon profile
            </label>
          </div>

          <div className="show-group">
            <h3>Mutate the data{selected !== null && <small> at {selected}</small>}</h3>
            <div className="show-buttons">
              <button
                type="button"
                disabled={!has}
                onClick={() => {
                  if (graph === null) return;
                  const added = addNode(graph, selected);
                  mutate(`added ${added.id}`, added.graph, added.id);
                }}
              >
                Add node
              </button>
              <button
                type="button"
                disabled={!has}
                onClick={() => graph !== null && mutate("added an edge", addEdge(graph, selected))}
              >
                Add edge
              </button>
              <button
                type="button"
                disabled={!has}
                onClick={() => graph !== null && mutate("renamed a node", rename(graph, selected))}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={!has}
                onClick={() => {
                  if (graph === null) return;
                  mutate("removed a node", removeNode(graph, selected));
                  setSelected(null);
                }}
              >
                Remove
              </button>
              <button
                type="button"
                disabled={!has}
                onClick={() => graph !== null && mutate("sent bad data", breakData(graph))}
              >
                Send bad data
              </button>
              <button
                type="button"
                disabled={!has}
                onClick={() => {
                  void load(sample).then((next) => mutate("reset", next));
                  setSelected(null);
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="show-group">
            <h3>Customize</h3>
            <div className="show-buttons">
              <label>
                <span className="sr-only">Layout</span>
                <select
                  data-control="layout"
                  value={layout}
                  onChange={(event) => {
                    const next = event.currentTarget.value as Layout;
                    setLayout(next);
                    viewer.current?.setLayout(next);
                  }}
                >
                  {LAYOUTS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" aria-pressed={isDark} data-control="dark" onClick={() => setDark(!isDark)}>
                Dark theme
              </button>
              <button type="button" aria-pressed={cards} data-control="cards" onClick={() => setCards(!cards)}>
                React nodes
              </button>
              <button type="button" onClick={() => viewer.current?.toggleTable()}>
                Table
              </button>
            </div>
          </div>
        </div>

        <pre className="show-log" data-show-log aria-live="polite">
          {log.join("\n") || "Press something in the viewer, or use the controls. Events show here."}
        </pre>
      </figure>
    </div>
  );
}

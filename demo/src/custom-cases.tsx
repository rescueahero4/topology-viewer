// The pages of the customization tests. Each one uses only the public API.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { defineProfile, mountTopology } from "topology-viewer";
import { DARK_THEME } from "./dark-theme";
import {
  createTopologyViewer,
  TopologyViewer,
  type TopologyEvent,
  type TopologyOptions,
  type TopologyViewerRef,
} from "topology-viewer/react";

const API = "http://127.0.0.1:4600/api";
const SERVICES = `${API}/graphs/services`;
const query = new URLSearchParams(location.search);
const log: { name: string; value: unknown }[] = [];
(window as unknown as { tvCustom: typeof log }).tvCustom = log;
const note = (name: string, value?: unknown): void => {
  log.push({ name, value });
};

const loadAll = (signal: AbortSignal) =>
  fetch(SERVICES, { signal })
    .then((answer) => answer.json())
    .then((graph) => ({ ...graph, view: { budget: "all", approach: "passive" } }));

const Shell = (
  props: TopologyOptions & {
    name?: string;
    ref?: ComponentProps<typeof TopologyViewer>["ref"];
  },
) => {
  const { name = "a", ...options } = props;
  return <TopologyViewer className={name} style={{ height: 620 }} load={loadAll} {...options} />;
};

function PageCss({ css }: { css: string }) {
  return <style>{css}</style>;
}

const Style = () => (
  <>
    <PageCss css={`.a::part(viewer-frame) { outline: 3px solid rgb(0, 128, 0); }
.a::part(family-tab) { letter-spacing: 3px; }`} />
    <Shell
      theme={{ frameRadius: "14px", surface: "rgb(250, 240, 230)", radiusSm: "1px", font: "Courier New" }}
      styles=".from-styles { letter-spacing: 2px; }"
      parts={{
        "inspector-title": { className: "from-styles" },
        "triple-row": { style: { paddingBlock: "9px" } },
        "table-row": { style: (state: { selected: boolean }) => (state.selected ? { background: "gold" } : undefined) },
        "focus-pill": { style: { outline: "1px solid red" } },
      }}
    />
  </>
);

function Dark() {
  const [mode, setMode] = useState("light");
  return (
    <>
      <button id="mode" onClick={() => setMode(mode === "light" ? "dark" : "light")}>
        mode
      </button>
      <Shell themes={{ dark: DARK_THEME }} colorMode={mode} />
    </>
  );
}

const PageStyles = () => (
  <>
    <PageCss css={`@layer utilities { .utility-probe { color: rgb(1, 2, 3); } }
@layer base { button { background: rgb(255, 0, 255); } }`} />
    <Shell pageStyles parts={{ "search-input": { className: "utility-probe" } , "family-tab": { className: "utility-probe" } }} />
  </>
);

const PageLink = () => (
  <>
    <link rel="stylesheet" href="/page-link.css" />
    <Shell pageStyles parts={{ "family-tab": { className: "utility-link" } }} />
  </>
);

function Full() {
  const how = query.get("how");
  const fullscreen =
    how === "native" || how === "viewport"
      ? how
      : how === "off"
        ? (false as const)
        : how === "custom"
          ? {
              enter: () => note("enter"),
              exit: () => note("exit"),
            }
          : undefined;
  const [mode, setMode] = useState<"inline" | "fullscreen">("inline");
  const controlled = how === "controlled";
  return (
    <div style={{ height: 900, transform: query.has("trap") ? "translateZ(0)" : undefined }}>
      <button id="ctl" onClick={() => setMode(mode === "inline" ? "fullscreen" : "inline")}>
        controlled
      </button>
      <input id="after" aria-label="after" />
      <Shell
        {...(fullscreen === undefined ? {} : { fullscreen })}
        {...(controlled ? { displayMode: mode } : {})}
        onDisplayModeChange={(next) => note("mode", next)}
        parts={{ "fullscreen-button": {} }}
      />
    </div>
  );
}

const SAVES: Record<string, () => Promise<unknown> | unknown> = {
  ok: () => undefined,
  slow: () => new Promise((done) => setTimeout(done, 400)),
  reject: () => Promise.reject(new Error("secret server text")),
  thrown: () => {
    throw new Error("secret server text");
  },
  text: () => ({ error: "The server is busy." }),
};

function Save() {
  const run = SAVES[query.get("save") ?? "ok"] as () => unknown;
  return (
    <Shell
      onSave={(changes, info) => {
        note("save", { changes, all: info.all });
        return run() as void;
      }}
      onDirtyChange={(dirty) => note("dirty", dirty)}
    />
  );
}

const Table = () => (
  <Shell
    parts={{
      table: {
        options: {
          validate: (change: { value: unknown }) =>
            change.value === "nope" ? "Not that value." : undefined,
          columns: [
            { core: "kind", hidden: true },
            { core: "name", label: "Display name" },
            { core: "id", editable: false },
            { attr: "language", label: "Lang", editor: { select: ["Go", "Rust"], message: "Pick one." } },
            { attr: "shout", label: "Shout", value: (row: { label?: string }) => row.label?.toUpperCase() },
          ],
        },
      },
      "table-cell": {
        match: ({ column }: { column: unknown }) => column === "system",
        render: ({ row }: { row: { label?: string } }) => <b className="custom-cell">{row.label}!</b>,
      },
      "table-filters": { options: { show: { rowType: false } } },
      "workbench-toolbar": {
        items: ["table-count", "table-filters", { id: "export", render: () => <button id="export">Export</button> }, "table-close"],
      },
      "change-bar": {
        after: ({ dirty }: { dirty: boolean }) => <span id="bar-after">{dirty ? "dirty" : "clean"}</span>,
      },
    }}
  />
);

const Readonly = () => <Shell parts={{ table: { options: { readOnly: true } } }} />;

function Search() {
  const remote = query.has("remote");
  const options = remote
    ? {
        source: async (text: string, signal: AbortSignal) => {
          note("source", text);
          if (text.includes("boom")) throw new Error("no");
          await new Promise((done) => setTimeout(done, 80));
          return signal.aborted ? [] : ["gw"];
        },
      }
    : {
        match: (node: { attrs: { language?: string } }, text: string) => node.attrs.language === text,
        limit: 1,
        debounce: 10,
        placeholder: "Find a thing",
      };
  return (
    <Shell
      keyboard={{ search: "mod+k" }}
      parts={{
        search: {
          options,
          on: {
            pick: (event: TopologyEvent) => {
              note("pick", event.id);
              if (query.has("stop")) event.preventDefault();
            },
          },
        },
        "search-result": {
          render: ({ node }: { node: { label: string } | null }) => (
            <span className="my-hit">Hit {node?.label}</span>
          ),
        },
      }}
    />
  );
}

const Brand = createContext("no provider");

function BrandName() {
  const brand = useContext(Brand);
  const [count, setCount] = useState(0);
  return (
    <button id="brand" onClick={() => setCount(count + 1)}>
      {brand} {count}
    </button>
  );
}

const Slots = () => (
  <Brand.Provider value="from context">
    <PageCss css=".page-styled { color: rgb(9, 8, 7); }" />
    <Shell
      parts={{
        "inspector-notes": {
          render: ({ node }: { node: { label: string } | null }) => (
            <p id="my-notes" className="page-styled">
              Notes of {node?.label}
            </p>
          ),
        },
        "inspector-body": {
          items: ["inspector-triples", { id: "brand", render: () => <BrandName /> }, "inspector-attributes", "inspector-notes"],
        },
        "attribute-row": {
          after: ({ label }: { label: string }) => <span className="after-row">{label}</span>,
        },
        "triple-row": {
          before: ({ triple }: { triple: { predicate: string } }) => <i className="before-triple">{triple.predicate}</i>,
        },
        "display-options": {
          items: [
            "layout-menu",
            { id: "mine", render: ({ commands }: { commands: { fit(): void } }) => <button id="mine" onClick={() => commands.fit()}>Mine</button> },
            "scope-menu",
          ],
        },
        "inspector-attributes": {
          options: {
            cap: 2,
            fields: [
              { key: "language", label: "Written in", format: (value: unknown) => `<${String(value)}>` },
              { key: "replicas", hidden: true },
              { label: "Owner", value: (node: { label: string }) => `owner of ${node.label}` },
            ],
          },
        },
        canvas: { after: () => <div id="legend" style={{ position: "absolute", right: 8, top: 60 }}>Legend</div> },
        "load-status": { render: ({ state }: { state: string }) => <p id="my-status">State {state}</p> },
      }}
    />
  </Brand.Provider>
);

function Node({ node, selected }: { node: { label: string; id: string }; selected: boolean }) {
  const [hits, setHits] = useState(0);
  return (
    <div
      className="react-node"
      data-selected={selected}
      style={{ width: 120, height: 44, background: selected ? "gold" : "white", border: "1px solid #333", boxSizing: "border-box" }}
    >
      {node.label}
      <button className="node-button" onClick={(event) => { event.stopPropagation(); setHits(hits + 1); }}>
        {hits}
      </button>
    </div>
  );
}

const Nodes = () => (
  <Shell
    parts={{
      node: {
        match: ({ node }: { node: { type: string | null } }) => node.type === "service",
        options: { sizes: { service: { width: 120, height: 44 } } },
        render: ({ node, selected }: { node: { label: string; id: string }; selected: boolean }) => (
          <Node node={node} selected={selected} />
        ),
        on: {
          activate: (event: TopologyEvent) => note("activate", event.id),
        },
      },
      edge: { style: { strokeWidth: "4px" } },
      tooltip: {
        render: ({ kind, node }: { kind: string; node?: { label: string } }) => (
          <span id="my-tip">{kind} {node?.label}</span>
        ),
      },
    }}
  />
);

const Filters = () => (
  <Shell
    parts={{
      filters: {
        options: {
          custom: [
            { id: "go", label: "Only Go", test: (node: { attrs: { language?: string } }) => node.attrs.language === "Go" },
            { id: "on", label: "Starts on", active: query.has("active"), test: () => true },
          ],
        },
      },
      "filter-families": { options: { off: ["Ownership"] } },
    }}
    onFiltersChange={(filters) => note("filters", filters)}
  />
);

const Display = () => (
  <Shell
    load={(signal) =>
      fetch(SERVICES, { signal })
        .then((answer) => answer.json())
        .then((graph) => ({ ...graph, view: { approach: "passive" } }))
    }
    layouts={{
      line: {
        label: "In a line",
        run: ({ nodes }) => Object.fromEntries(nodes.map((node, at) => [node.id, { x: at * 150, y: 10 }])),
      },
    }}
    parts={{
      "scope-menu": { options: { budgets: [3, 7, "all"], default: 3 } },
      "layout-menu": { options: { layouts: ["force", "tree-h"], default: "custom:line" } },
      "grouping-menu": { hidden: true },
    }}
  />
);

function Commands() {
  const ref = useRef<TopologyViewerRef>(null);
  const [state, setState] = useState("");
  return (
    <>
      <button id="c-focus" onClick={() => ref.current?.focus("gw")}>focus</button>
      <button id="c-layout" onClick={() => ref.current?.setLayout("tree-v")}>layout</button>
      <button id="c-table" onClick={() => ref.current?.openTable()}>table</button>
      <button id="c-inspector" onClick={() => ref.current?.setInspectorOpen(false)}>inspector</button>
      <button id="c-search" onClick={() => ref.current?.setSearch("Gate")}>search</button>
      <button id="c-sort" onClick={() => ref.current?.setTableFilters({ rowType: "edges" })}>filter</button>
      <button id="c-state" onClick={() => setState(JSON.stringify(ref.current?.getState()))}>state</button>
      <pre id="state">{state}</pre>
      <Shell
        ref={ref}
        onAction={(event) => {
          note("action", event.type);
          if (event.type === "hide" && query.has("noHide")) event.preventDefault();
        }}
        parts={{
          "family-tab": {
            on: {
              toggleFamily: (event: TopologyEvent) => {
                note("family", { part: event.part, value: event.value });
                if (query.has("stop")) event.preventDefault();
              },
              press: () => note("press-tab"),
            },
          },
          node: {
            on: {
              select: (event: TopologyEvent) => {
                note("node-select", event.id);
                if (query.has("noSelect")) event.preventDefault();
              },
            },
          },
        }}
        onStateChange={(next) => note("state", next.layout)}
      />
    </>
  );
}

const Keys = () => (
  <Shell keyboard={query.has("off") ? false : { search: false, toggleTable: "mod+j", escape: false }} />
);

const ICON = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="x" fill="none">
  <title>Robot</title><circle cx="12" cy="12" r="9" stroke="#123456" stroke-width="2"/></svg>`;

const Profile = () => {
  let rejected = "";
  try {
    defineProfile({ nodeTypes: { x: { icon: `<svg viewBox="0 0 2 2"><script>alert(1)</script></svg>` } } });
  } catch (error) {
    rejected = (error as Error).message;
  }
  let onEvent = "";
  try {
    defineProfile({ nodeTypes: { x: { icon: `<svg viewBox="0 0 2 2"><path d="M0 0" onclick="x()"/></svg>` } } });
  } catch (error) {
    onEvent = (error as Error).message;
  }
  note("rejected", [rejected, onEvent]);
  const profile = defineProfile({
    families: ["Traffic"],
    nodeTypes: {
      robot: { label: "Robot", icon: ICON, color: "#123456", category: "Machines" },
      person: { label: "Person", color: "#7c3aed", category: "People", rank: 2 },
    },
    predicates: { drives: { family: "Traffic", inverse: "drivenBy" } },
  });
  return (
    <Shell
      profile={profile}
      familyLooks={{ Traffic: { main: "#ff0000", tint: "#ffeeee", border: "#ff8888", icon: "bot" } }}
      data={{
        nodes: [
          { id: "r", type: "robot", label: "R2" },
          { id: "p", type: "person", label: "Luke" },
        ],
        edges: [{ source: "p", target: "r", predicate: "drives" }],
        view: { budget: "all", approach: "passive" },
      }}
    />
  );
};

const Preset = createTopologyViewer({
  theme: { frameRadius: "7px" },
  parts: {
    "grouping-menu": { hidden: true },
    "dataset-button": { style: { outline: "1px solid blue" } },
  },
});

const Presets = () => (
  <>
    <Preset className="a" style={{ height: 400 }} load={loadAll} />
    <Preset
      className="b"
      style={{ height: 400 }}
      load={loadAll}
      theme={{ frameRadius: "2px" }}
      parts={{ "grouping-menu": { hidden: false } }}
    />
  </>
);

function Dom() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewer = mountTopology(host.current as HTMLDivElement, {
      load: loadAll,
      parts: {
        "inspector-notes": {
          render: (ctx: { node: { label: string } | null }, element: HTMLElement) => {
            element.textContent = `DOM notes of ${ctx.node?.label}`;
            element.id = "dom-notes";
            return () => note("cleanup");
          },
        },
        "focus-pill": { after: "plain text" },
      },
    });
    return () => viewer.destroy();
  }, []);
  return <div ref={host} className="a" style={{ height: 620, display: "block" }} />;
}

export const CUSTOM_CASES: Record<string, () => ReactNode> = {
  "c-style": Style,
  "c-dark": Dark,
  "c-page-styles": PageStyles,
  "c-page-link": PageLink,
  "c-full": Full,
  "c-save": Save,
  "c-table": Table,
  "c-readonly": Readonly,
  "c-search": Search,
  "c-slots": Slots,
  "c-nodes": Nodes,
  "c-filters": Filters,
  "c-display": Display,
  "c-commands": Commands,
  "c-keys": Keys,
  "c-profile": Profile,
  "c-presets": Presets,
  "c-dom": Dom,
};

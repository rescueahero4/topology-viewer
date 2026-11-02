// The pages of the browser tests. Each one is a small use of the public API.
import { StrictMode, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { qdicProfile } from "topology-viewer/profiles/qdic";
import {
  TopologyViewer,
  type TopologyOptions,
  type TopologyViewerRef,
} from "topology-viewer/react";

const API = "http://127.0.0.1:4600/api";
const query = new URLSearchParams(location.search);
const path = query.get("path") ?? "/graphs/catalog";
const events: unknown[] = [];
(window as unknown as { tvEvents: unknown[] }).tvEvents = events;

const log = (name: string) => (value?: unknown) => {
  events.push({ name, value });
};

const common: TopologyOptions = {
  variant: query.get("variant") === "widget" ? "widget" : "page",
  ...(query.get("profile") === "qdic" ? { profile: qdicProfile } : {}),
  ...(query.get("lang") === "ja" ? { lang: "ja" as const } : {}),
  onError: (error) => log("error")({ kind: error.kind, status: error.status }),
  onSelect: log("select"),
  onSave: log("save"),
};

function Viewer(props: TopologyOptions & { name?: string }) {
  const { name = "a", ...options } = props;
  return (
    <TopologyViewer
      className={name}
      style={{ height: 620 }}
      {...common}
      {...options}
    />
  );
}

function Host({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 className="host-probe">Host page</h1>
      <input id="host-input" aria-label="host input" />
      <div className="split" id="probe-split">a host element with class split</div>
      <button id="probe-button">a host button</button>
      {children}
    </div>
  );
}

const load = (url: string, init: RequestInit, signal: AbortSignal) =>
  fetch(API + url, { ...init, signal }).then((answer) => answer.json());

function Envelope() {
  return (
    <Viewer
      load={(signal) =>
        load("/wrapped/catalog", {}, signal).then((r) => r.result.graph)
      }
    />
  );
}

function Auth() {
  return (
    <Viewer
      load={(signal) =>
        load(
          "/auth/catalog",
          { headers: { authorization: "Bearer demo-token" } },
          signal,
        )
      }
    />
  );
}

function Data() {
  const [data, setData] = useState<unknown>({
    nodes: [
      { id: "a", type: "service", label: "From a prop" },
      { id: "b", type: "service", label: "Second" },
    ],
    edges: [{ source: "a", target: "b", predicate: "dependsOn" }],
    view: { budget: "all", approach: "passive" },
  });
  return (
    <>
      <button
        id="new-data"
        onClick={() =>
          setData({ nodes: [{ id: "c", type: "t", label: "New prop data" }] })
        }
      >
        new data
      </button>
      <Viewer data={data} />
    </>
  );
}

function Hostile() {
  const script = '<img src=x onerror="window.tvHacked=1">';
  return (
    <Viewer
      data={{
        nodes: [
          {
            id: "x",
            type: script,
            label: script,
            attrs: {
              description: script,
              link: "javascript:window.tvHacked=1",
              url: "javascript:window.tvHacked=1",
              __proto__x: script,
            },
          },
          { id: "y", type: script, label: "Second" },
        ],
        edges: [{ source: "x", target: "y", predicate: script }],
        types: { [script]: { label: script, color: "url(javascript:alert(1))", glyph: script } },
        view: { budget: "all", approach: "passive" },
      }}
    />
  );
}

function Switch() {
  const [url, setUrl] = useState(`${API}/slow/catalog?ms=1200`);
  return (
    <>
      <button id="to-fast" onClick={() => setUrl(`${API}/graphs/services`)}>
        to fast
      </button>
      <Viewer url={url} />
    </>
  );
}

function Reload() {
  const [, render] = useState(0);
  const ref = useRef<TopologyViewerRef>(null);
  return (
    <>
      <button id="rerender" onClick={() => render((n) => n + 1)}>
        render again
      </button>
      <button id="ref" onClick={() => ref.current?.reload()}>
        ref reload
      </button>
      <TopologyViewer
        ref={ref}
        className="a"
        style={{ height: 620 }}
        url={`${API}/graphs/services`}
      />
    </>
  );
}

function Two() {
  return (
    <>
      <Viewer name="a" url={`${API}/graphs/catalog`} />
      <Viewer name="b" url={`${API}/graphs/services`} />
    </>
  );
}

function Toggle() {
  const [on, setOn] = useState(true);
  return (
    <>
      <button id="toggle" onClick={() => setOn((value) => !value)}>
        toggle
      </button>
      {on && <Viewer url={`${API}/graphs/services`} />}
    </>
  );
}

const CASES: Record<string, () => ReactNode> = {
  url: () => <Viewer url={API + path} />,
  envelope: Envelope,
  auth: Auth,
  data: Data,
  hostile: Hostile,
  switch: Switch,
  reload: Reload,
  two: Two,
  toggle: Toggle,
  strings: () => (
    <Viewer
      url={`${API}/graphs/services`}
      strings={{ "types.button": "Kinds of thing" }}
    />
  ),
};

const Case = CASES[query.get("case") ?? "url"] ?? CASES.url;

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Host>
      <Case />
    </Host>
  </StrictMode>,
);

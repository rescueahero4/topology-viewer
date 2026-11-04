import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TopologyViewer, type TopologyViewerRef } from "topology-viewer/react";
import names from "../../../types/parts.d.ts?raw";
import services from "../demos/data/services.json";
import { darkTokens, useSiteTheme } from "./siteTheme";

const STABLE = new Set([...names.matchAll(/\|\s*"([\w-]+)"/g)].map((one) => one[1]));
const STATES = /^(selected|pressed|expanded|checked|disabled|focused|faded|state-.+)$/;

type Found = { name: string; states: string[]; chain: string[]; box: DOMRect };

function foundAt(event: Event): Found | null {
  const chain: string[] = [];
  let first: Omit<Found, "chain"> | null = null;
  for (const item of event.composedPath()) {
    if (!(item instanceof Element)) continue;
    const part = item.getAttribute("part");
    if (part === null) continue;
    const tokens = part.split(/\s+/).filter((one) => one !== "");
    const own = tokens.filter((one) => !STATES.test(one));
    const name = own.find((one) => STABLE.has(one)) ?? own[0];
    if (name === undefined) continue;
    if (first === null)
      first = {
        name,
        states: tokens.filter((one) => STATES.test(one)),
        box: item.getBoundingClientRect(),
      };
    if (STABLE.has(name) && !chain.includes(name)) chain.push(name);
  }
  return first === null ? null : { ...first, chain };
}

/** Point at anything in the viewer to read its public name. */
export default function PartExplorer() {
  const theme = useSiteTheme();
  const viewer = useRef<TopologyViewerRef>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [kept, setKept] = useState<Found | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = stage.current;
    if (el === null) return;
    const move = (event: Event) => {
      const next = foundAt(event);
      setFound(next);
      if (next !== null) setKept(next);
    };
    const leave = () => setFound(null);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    const open = setTimeout(() => {
      viewer.current?.focus("orders");
      viewer.current?.openTable();
    }, 500);
    return () => {
      clearTimeout(open);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  const shown = found ?? kept;
  const stable = shown !== null && STABLE.has(shown.name);
  const snippet =
    shown === null
      ? ""
      : `.my-viewer::part(${shown.name}) { }\n\nparts={{ "${shown.name}": { className: "", style: {} } }}`;

  return (
    <>
      <div className="demo-bar" data-explorer-name={shown?.name ?? ""}>
        {shown === null ? (
          "Point at anything in the viewer."
        ) : (
          <>
            <strong>{shown.name}</strong>
            <span>{stable ? "stable" : "style only: can change before 1.0"}</span>
            {shown.states.length > 0 && <span>state: {shown.states.join(", ")}</span>}
            <button
              onClick={() => {
                void navigator.clipboard.writeText(snippet).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                });
              }}
            >
              {copied ? "Copied" : "Copy the code"}
            </button>
          </>
        )}
      </div>
      <div
        ref={stage}
        key={theme}
        style={{ height: 620, ...(theme === "dark" ? darkTokens : {}) } as CSSProperties}
      >
        <TopologyViewer ref={viewer} data={services} />
      </div>
      <pre className="demo-log" style={{ height: "5.5rem" }}>
        {shown === null ? "" : `Inside: ${shown.chain.join(" › ") || "viewer-frame"}\n\n${snippet}`}
      </pre>
      {found !== null && (
        <>
          <div
            className="explorer-box"
            style={{
              left: found.box.left,
              top: found.box.top,
              width: found.box.width,
              height: found.box.height,
            }}
          />
          <div
            className="explorer-tag"
            style={{ left: found.box.left, top: Math.max(0, found.box.top - 20) }}
          >
            {found.name}
          </div>
        </>
      )}
    </>
  );
}

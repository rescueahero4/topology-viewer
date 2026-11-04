import { keyIs } from "./custom";
import { inKeyScope, targetOf } from "./eventScope";
import { canvasLookup, matchEntities, type Graph } from "#engine";
import { nodeData, type PublicNode } from "./commands";
import { custom, dispatch, live, optionOf } from "./custom";
import { extendable } from "./Part";
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useElementId } from "./ids";
import type { Actions } from "./actions";
import { limitOf, pickHit, SearchResults } from "./SearchResults";
import { canvasState, editedModel, lang } from "./state";
import { t } from "./strings/index";
import { UiIcon } from "./UiIcon";

// why: mockup search (app.js line 969) — the match runs 120 ms after the last key
const DEBOUNCE_MS = 120;

type Match = (node: PublicNode, query: string) => boolean;
type Source = (query: string, signal: AbortSignal) => Promise<readonly string[]>;
type Remote = {
  query: string;
  hits: readonly string[];
  status: "idle" | "loading" | "failed";
};

// `source`: the hits come from the code of the developer, so the query can leave the page only when
// the developer sends it. A new query cancels the one before it.
function useRemote(query: string): Remote | null {
  const source = optionOf<Source>("search", "source");
  const [remote, setRemote] = useState<Remote>({
    query: "",
    hits: [],
    status: "idle",
  });
  const has = source !== undefined;
  useEffect(() => {
    if (!has || query.trim() === "") return;
    const own = new AbortController();
    setRemote({ query, hits: [], status: "loading" });
    (source as Source)(query, own.signal).then(
      (hits) => {
        if (!own.signal.aborted) setRemote({ query, hits, status: "idle" });
      },
      () => {
        if (!own.signal.aborted) setRemote({ query, hits: [], status: "failed" });
      },
    );
    return () => own.abort();
  }, [has, query]);
  return has ? remote : null;
}

function localHits(graph: Graph, query: string): readonly string[] {
  const match = optionOf<Match>("search", "match");
  if (match === undefined) return matchEntities(graph, query);
  if (query.trim() === "") return [];
  return graph.entities.flatMap((entity) => {
    const node = nodeData(entity.id);
    return node !== null && match(node, query) ? [entity.id] : [];
  });
}

// why: mockup `isField` (app.js line 78) — a key in a text field is typing, not a command
export const isField = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("input, textarea, select") !== null;

// why: NF-5 (mockup app.js lines 987-990) — `/` focuses the search when no text field has focus
function useSlashKey(input: RefObject<HTMLInputElement>): void {
  useEffect(() => {
    const doc = input.current?.ownerDocument;
    const onKey = (event: KeyboardEvent) => {
      if (!keyIs("search", event) || !inKeyScope(event)) return;
      if (isField(targetOf(event))) return;
      event.preventDefault();
      input.current?.focus();
    };
    doc?.addEventListener("keydown", onKey);
    return () => doc?.removeEventListener("keydown", onKey);
  }, [input]);
}

// why: rule 3 (mockup app.js lines 963-984) — the query takes the input text 120 ms after the last
// key; Escape clears the input and closes the list; the query is never stored or sent
function useQuery(input: RefObject<HTMLInputElement>) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    ...{ query, open, active, setActive },
    close: () => setOpen(false),
    onInput: () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => {
          const value = input.current?.value ?? "";
          const least = optionOf<number>("search", "minLength", 1);
          const enough = value.trim() !== "" && value.trim().length >= least;
          setQuery(enough ? value : "");
          setActive(0);
          setOpen(enough);
        },
        optionOf<number>("search", "debounce", DEBOUNCE_MS),
      );
    },
    clear: () => {
      clearTimeout(timer.current);
      if (input.current !== null) input.current.value = "";
      setQuery("");
      setOpen(false);
      input.current?.blur();
    },
  };
}

function searchKeyShown(): boolean {
  const map = custom.value.keyboard;
  return map !== false && map?.search !== false;
}

// why: rule 3 — one `canvasLookup` for each result list, made only while the list is open
function useLookup(open: boolean) {
  const now = editedModel.value;
  const state = canvasState.value;
  return useMemo(
    () =>
      open && now !== null && state !== null
        ? canvasLookup(state, now.graph, now.vocab)
        : null,
    [open, now, state],
  );
}

type SearchProps = {
  actions: Actions;
  embedded: boolean;
  children?: ComponentChildren;
};

// why: FR-CANVAS-4, FR-DATA-5, rule 3 (mockup index.html lines 73-82, app.js lines 951-985) — the
// hits of `matchEntities` with their canvas state. STORY-007-03 rule 6 (embed-frame.html lines
// 25-26) — embedded, the search is its own card and the tools are no card. STORY-007-04 rule 1
// (line 34) — the children (the full-screen button) come after the search in the tools
function SearchView(props: SearchProps) {
  const { actions, embedded } = props;
  const ui = lang.value;
  const now = editedModel.value;
  const id = useElementId();
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery(input);
  const remote = useRemote(q.query);
  const local = useMemo(
    () => (now === null || remote !== null ? [] : localHits(now.graph, q.query)),
    [now, q.query, remote !== null],
  );
  const hits = remote?.query === q.query ? remote.hits : local;
  useEffect(() => {
    live.search = {
      get: () => input.current?.value ?? "",
      set: (text) => {
        if (input.current === null) return;
        input.current.value = text;
        q.onInput();
      },
    };
    return () => {
      live.search = null;
    };
  });
  const lookup = useLookup(q.open);
  useSlashKey(input);
  const last = Math.min(hits.length, limitOf()) - 1;
  const pick = (hit: string) => {
    const node = nodeData(hit);
    if (dispatch("pick", [hit], { id: hit, node }, ["search-result", "search"]))
      pickHit(actions, lookup, hit);
    q.close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      q.setActive((at) => Math.max(0, Math.min(last, at + step)));
    } else if (event.key === "Enter" && q.open && q.active <= last) {
      pick(hits[q.active]);
    } else if (event.key === "Escape") q.clear();
  };
  return (
    <div class={embedded ? "tools" : "tools float-card"}>
      <div class={embedded ? "search float-card" : "search"}>
        <span class="ic">
          <UiIcon name="search" />
        </span>
        <label id={`${id}-label`} for={id} class="sr-only">
          {t(ui, "search.label")}
        </label>
        <input
          ref={input}
          {...{ id, type: "search", autocomplete: "off" }}
          placeholder={optionOf<string>("search", "placeholder", t(ui, "search.label"))}
          onInput={q.onInput}
          onKeyDown={onKeyDown}
          onBlur={q.close}
        />
        {searchKeyShown() && <kbd>{t(ui, "search.key")}</kbd>}
        {q.open && now !== null && (
          <SearchResults
            {...{ model: now, lookup, hits, active: q.active, query: q.query }}
            status={remote?.status ?? "idle"}
            labelledBy={`${id}-label`}
            onPick={pick}
          />
        )}
      </div>
      {props.children}
    </div>
  );
}

export const Search = extendable("search", SearchView);

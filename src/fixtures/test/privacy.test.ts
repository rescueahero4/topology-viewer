import { describe, expect, it } from "vitest";
import { generate } from "../src";
import { datasetFiles, qdicFiles, scenarioFiles } from "../src/files";

const EMAIL = /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g;
const URL_HOST = /\b(?:https?:\/\/|www\.)([\w-]+(?:\.[\w-]+)+)/gi;
// a bare host name: dotted words that end in a public suffix
const BARE_HOST =
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|jp|dev|app|cloud|co|ai|edu|gov)\b/gi;
// SA-Intro example ids are the only tenant-like ids allowed (STORY-001-06 Context)
const TENANT_ID = /^[a-z]+-[0-9a-f]{8,}(?:-|$)/;
const ALLOWED_HOSTS = ["example.com", "console.cloud.google.com"];

// why: an explicit stack, so the 10,000-level generator tree does not overflow (STORY-002-01 S37)
function strings(value: unknown): string[] {
  const out: string[] = [];
  const stack = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === "string") out.push(item);
    else if (Array.isArray(item)) stack.push(...(item as unknown[]));
    else if (typeof item === "object" && item !== null)
      for (const [key, child] of Object.entries(item)) {
        out.push(key);
        stack.push(child);
      }
  }
  return out;
}

const corpus = [...datasetFiles, ...scenarioFiles, ...qdicFiles].flatMap(
  (file) => strings(file),
);

function hostsIn(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) =>
    (match[1] ?? match[0]).toLowerCase(),
  );
}

const allowed = (host: string) =>
  host.endsWith(".example") ||
  ALLOWED_HOSTS.some((ok) => host === ok || host.endsWith(`.${ok}`));

describe("S15 no real person, host or tenant id", () => {
  it("reads strings from the whole corpus", () => {
    expect(corpus.length).toBeGreaterThan(10000);
  });

  it("ends every e-mail address in .example or example.com", () => {
    const bad = corpus
      .flatMap((text) => hostsIn(text, EMAIL))
      .filter((h) => !allowed(h));
    expect(bad).toEqual([]);
  });

  it("puts every URL under example.com, .example or the generic BigQuery page", () => {
    const bad = corpus
      .flatMap((text) => hostsIn(text, URL_HOST))
      .filter((h) => !allowed(h));
    expect(bad).toEqual([]);
  });

  it("puts every host name under example.com or .example", () => {
    const bad = corpus
      .flatMap((text) => hostsIn(text, BARE_HOST))
      .filter((h) => !allowed(h));
    expect(bad).toEqual([]);
  });

  it("holds no string that looks like a tenant id", () => {
    expect(corpus.filter((text) => TENANT_ID.test(text))).toEqual([]);
  });

  it("holds no text of the live domains that the rewrite map removes", () => {
    expect(
      corpus.filter((text) => /acme\.com|snowflake\.com/i.test(text)),
    ).toEqual([]);
  });

  it("keeps the rewritten domains in the access dataset", () => {
    const access = JSON.stringify(
      datasetFiles.find((file) => (file as { key: string }).key === "access"),
    );
    expect(access).toContain("@acme.example");
  });
});

describe("S15 negative cases", () => {
  it("catches a live e-mail domain, a live URL and a tenant id", () => {
    expect(hostsIn("aiko@acme.com", EMAIL).filter((h) => !allowed(h))).toEqual([
      "acme.com",
    ]);
    expect(
      hostsIn("https://app.snowflake.com/x", URL_HOST).filter(
        (h) => !allowed(h),
      ),
    ).toEqual(["app.snowflake.com"]);
    expect(
      hostsIn("tableau.acme.com", BARE_HOST).filter((h) => !allowed(h)),
    ).toEqual(["tableau.acme.com"]);
    expect(TENANT_ID.test("tbl-0123456789abcdef-x")).toBe(true);
    expect(TENANT_ID.test("node-8f3a")).toBe(false);
  });
});

describe("S37 the generator output is synthetic", () => {
  const graphs = [
    generate.grid(27, 45),
    generate.chain(20),
    generate.star(500),
    generate.random(2000, 4000, 42),
  ];
  const output = [
    ...graphs,
    generate.tree(2, { width: 5000 }),
    generate.tree(10000),
  ].flatMap((value) => strings(value));

  it("holds no e-mail address, URL or host name", () => {
    expect(output.length).toBeGreaterThan(10000);
    expect(output.flatMap((text) => hostsIn(text, EMAIL))).toEqual([]);
    expect(output.flatMap((text) => hostsIn(text, URL_HOST))).toEqual([]);
    expect(output.flatMap((text) => hostsIn(text, BARE_HOST))).toEqual([]);
  });

  it("gives only ids of the form n0, n1, …", () => {
    const ids = graphs.flatMap((graph) => [
      ...graph.nodes.map((node) => node.id),
      ...graph.edges.flatMap((edge) => [edge.subject, edge.object]),
    ]);
    expect(ids.filter((id) => !/^[a-z]+[0-9.]*$/.test(id))).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPayload, TopologyLoadError } from "./fetchPayload";

const signal = () => new AbortController().signal;
const answer = (body: string, status = 200) =>
  vi.fn(async () => new Response(body, { status }));

afterEach(() => vi.unstubAllGlobals());

describe("fetchPayload", () => {
  it("gets the payload of a url and passes the request options", async () => {
    const fetchStub = answer('{"nodes":[]}');
    vi.stubGlobal("fetch", fetchStub);
    const own = signal();
    const payload = await fetchPayload(
      { url: "/graph", requestInit: { headers: { a: "b" } } },
      own,
    );
    expect(payload).toEqual({ nodes: [] });
    expect(fetchStub).toHaveBeenCalledWith("/graph", {
      headers: { a: "b" },
      signal: own,
    });
  });

  it("gives the kind http and the status, with no server text", async () => {
    vi.stubGlobal("fetch", answer("secret detail", 503));
    const error = await fetchPayload({ url: "/graph" }, signal()).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(TopologyLoadError);
    expect(error).toMatchObject({ kind: "http", status: 503 });
    expect((error as Error).message).not.toContain("secret");
  });

  it("gives the kind parse for an answer that is not JSON", async () => {
    vi.stubGlobal("fetch", answer("<html>"));
    await expect(
      fetchPayload({ url: "/graph" }, signal()),
    ).rejects.toMatchObject({ kind: "parse" });
  });

  it("gives the kind network when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(
      fetchPayload({ url: "/graph" }, signal()),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("does not change an abort into a network error", async () => {
    const own = new AbortController();
    const cause = new DOMException("stop", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        own.abort();
        throw cause;
      }),
    );
    await expect(fetchPayload({ url: "/graph" }, own.signal)).rejects.toBe(
      cause,
    );
  });

  it("uses `load` when there is no url, and gives it the signal", async () => {
    const load = vi.fn(async () => ({ edges: [] }));
    const own = signal();
    await expect(fetchPayload({ load }, own)).resolves.toEqual({ edges: [] });
    expect(load).toHaveBeenCalledWith(own);
  });

  it("gives the kind load when `load` throws", async () => {
    const load = async () => {
      throw new Error("client");
    };
    await expect(fetchPayload({ load }, signal())).rejects.toMatchObject({
      kind: "load",
    });
  });

  it("applies `select`, and gives the kind select when it throws", async () => {
    const load = async () => ({ result: { graph: 1 } });
    await expect(
      fetchPayload(
        { load, select: (r) => (r as { result: unknown }).result },
        signal(),
      ),
    ).resolves.toEqual({ graph: 1 });
    await expect(
      fetchPayload(
        {
          load,
          select: () => {
            throw new Error("bad");
          },
        },
        signal(),
      ),
    ).rejects.toMatchObject({ kind: "select" });
  });
});

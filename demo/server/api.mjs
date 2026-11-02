// A mock of an external API. It knows nothing about the library: it only serves JSON, on its own
// port, with CORS. The data files are copies of the mock data of the MCP widget.
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = 4600;
const DATA = path.join(import.meta.dirname, "data");
const payload = (name) => readFileSync(path.join(DATA, `${name}.json`), "utf8");
const names = readdirSync(DATA).map((file) => file.replace(/\.json$/, ""));

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (parts[0] !== "api") return send(res, 404, '{"error":"not found"}');

  const [, route, name] = parts;

  if (route === "graphs" && name === undefined)
    return send(res, 200, JSON.stringify(names));
  if (route === "graphs" && names.includes(name))
    return send(res, 200, payload(name));
  if (route === "wrapped" && names.includes(name))
    return send(res, 200, `{"ok":true,"result":{"graph":${payload(name)}}}`);
  if (route === "slow" && names.includes(name)) {
    await wait(Number(url.searchParams.get("ms") ?? 800));
    return send(res, 200, payload(name));
  }
  if (route === "auth" && names.includes(name)) {
    if (req.headers.authorization !== "Bearer demo-token")
      return send(res, 401, '{"error":"secret server text"}');
    return send(res, 200, payload(name));
  }
  if (route === "fail" && name === "500")
    return send(res, 500, '{"error":"secret server text"}');
  if (route === "fail" && name === "notjson")
    return send(res, 200, "<html>a proxy page</html>", "text/html");
  if (route === "fail" && name === "badshape")
    return send(res, 200, '{"nodes":"not a list","edges":3}');
  return send(res, 404, '{"error":"not found"}');
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`Mock API on http://127.0.0.1:${PORT}/api/graphs`),
);

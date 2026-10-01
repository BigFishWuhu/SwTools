import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(root, "data");
const dbPath = join(dataDir, "codex.sqlite");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS monster_edits (
  monster_key TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL DEFAULT '',
  awakened_name_zh TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml"
};
const json = (response, status, body) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(body)); };

function readEdits() {
  const rows = db.prepare("SELECT monster_key, name_zh, awakened_name_zh, aliases_json FROM monster_edits ORDER BY monster_key").all();
  return Object.fromEntries(rows.map((row) => [row.monster_key, { nameZh: row.name_zh, awakenedNameZh: row.awakened_name_zh, aliases: JSON.parse(row.aliases_json || "[]") }]));
}

async function requestBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === "/" || pathname === "\\" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const filePath = resolve(root, requested);
  if (!filePath.startsWith(root) || !(await stat(filePath).catch(() => null))) return json(response, 404, { error: "Not found" });
  const file = await readFile(filePath);
  response.writeHead(200, { "content-type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
  response.end(file);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/monster-edits" && request.method === "GET") return json(response, 200, { edits: readEdits() });
    if (url.pathname.startsWith("/api/monster-edits/") && request.method === "PUT") {
      const key = decodeURIComponent(url.pathname.slice("/api/monster-edits/".length));
      if (!/^[0-9]+-(Fire|Water|Wind|Light|Dark|Pure)$/.test(key)) return json(response, 400, { error: "Invalid monster key" });
      const body = await requestBody(request);
      const nameZh = String(body.nameZh || "").trim().slice(0, 40);
      const awakenedNameZh = String(body.awakenedNameZh || "").trim().slice(0, 40);
      const aliases = [...new Set((Array.isArray(body.aliases) ? body.aliases : []).map((alias) => String(alias).trim()).filter(Boolean))].slice(0, 30);
      db.prepare(`INSERT INTO monster_edits (monster_key, name_zh, awakened_name_zh, aliases_json, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(monster_key) DO UPDATE SET name_zh=excluded.name_zh, awakened_name_zh=excluded.awakened_name_zh, aliases_json=excluded.aliases_json, updated_at=CURRENT_TIMESTAMP`).run(key, nameZh, awakenedNameZh, JSON.stringify(aliases));
      return json(response, 200, { key, nameZh, awakenedNameZh, aliases });
    }
    if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
    return serveStatic(request, response, normalize(url.pathname));
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => console.log(`召唤师图鉴运行于 http://127.0.0.1:${port}`));

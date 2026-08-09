// リポジトリルートを配るだけの静的サーバ。
// Playwright の webServer から起動される。
//
// なぜ必要か: index.html を file:// で開くと OZ.Request（XHR）が CORS で落ち、
// locale/*.xml と db/*/datatypes.xml が取れず SQL.Designer の init2() に到達しない。
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".xml": "text/xml; charset=utf-8",
    ".xsl": "text/xml; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = normalize(join(ROOT, rel === "" ? "index.html" : rel));

    // パストラバーサル封じ
    if (target !== ROOT.replace(/[\\/]$/, "") && !target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
        res.writeHead(403).end("forbidden");
        return;
    }

    try {
        const s = await stat(target);
        if (s.isDirectory()) {
            res.writeHead(403).end("directory listing disabled");
            return;
        }
        res.writeHead(200, {
            "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
            "cache-control": "no-store",
        });
        createReadStream(target).pipe(res);
    } catch {
        res.writeHead(404).end("not found");
    }
});

server.listen(PORT, "127.0.0.1", () => {
    process.stdout.write(`static-server: ${ROOT} -> http://127.0.0.1:${PORT}/\n`);
});

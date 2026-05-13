// Node.js production server for self-hosted VPS deployment (Ubuntu + nginx + PM2).
// Serves the TanStack Start SSR fetch handler from dist/server/server.js
// and the static client bundle from dist/client/.
//
// Start with:
//   PORT=3000 node server.mjs
// or via PM2:
//   pm2 start server.mjs --name radius-track --update-env
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "dist/server/server.js");
const CLIENT_DIR = resolve(__dirname, "dist/client");

if (!existsSync(SERVER_ENTRY)) {
  console.error(
    `[server] Missing ${SERVER_ENTRY}. Run \`npm run build\` first.`,
  );
  process.exit(1);
}
if (!existsSync(CLIENT_DIR)) {
  console.error(
    `[server] Missing ${CLIENT_DIR}. Run \`npm run build\` first.`,
  );
  process.exit(1);
}

const ssr = await import(SERVER_ENTRY);
const ssrFetch = ssr.default?.fetch ?? ssr.fetch;
if (typeof ssrFetch !== "function") {
  console.error("[server] dist/server/server.js does not export a fetch handler.");
  process.exit(1);
}

const app = new Hono();

// 1) Try built static assets first (hashed JS/CSS/fonts/images, /favicon.ico, etc.).
//    If a file is not found, serveStatic calls next() and we fall through to SSR.
app.use(
  "/*",
  serveStatic({
    root: "./dist/client",
  }),
);

// 2) Everything else -> TanStack Start SSR + server functions + /api/* routes.
app.all("/*", (c) => ssrFetch(c.req.raw));

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(
    `[server] radius-track listening on http://${info.address}:${info.port}`,
  );
});

const shutdown = (signal) => {
  console.log(`[server] received ${signal}, shutting down`);
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

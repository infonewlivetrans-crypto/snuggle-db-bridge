// Build script for Radius Track Browser Agent (MV3).
// Bundles background/content/popup, copies static assets, injects BUILD_DATE.
// Channel is selected via RT_CHANNEL env var: "dev" (default) or "stable".
// Stable strips dev popup, lovable.app hosts, diagnostic UI, and mock helpers
// (enforced by scripts/package-extension.mjs forbidden-strings scan).
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { copyStatic } from "./scripts/copy-static.mjs";

// Clean dist/ before each build so leftover dev sourcemaps or dev artifacts
// never contaminate a stable package.
const __root = path.dirname(fileURLToPath(import.meta.url));
rmSync(path.join(__root, "dist"), { recursive: true, force: true });

const watch = process.argv.includes("--watch");
const buildDate = new Date().toISOString();
const commitSha = process.env.RT_COMMIT_SHA ?? "";
const channel = process.env.RT_CHANNEL === "stable" ? "stable" : "dev";

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "esm",
  target: ["chrome110"],
  logLevel: "info",
  sourcemap: channel === "dev",
  minify: channel === "stable",
  legalComments: "none",
  define: {
    "__RT_BUILD_DATE__": JSON.stringify(buildDate),
    "__RT_COMMIT_SHA__": JSON.stringify(commitSha),
    "__RT_CHANNEL__": JSON.stringify(channel),
    // Dev-only origin whitelist injected at build time. Empty for stable so
    // no lovable.app / preview literals appear in the production bundle.
    "__RT_DEV_ORIGINS__": JSON.stringify(
      channel === "stable"
        ? []
        : [
            "https://snuggle-db-bridge.lovable.app",
            "https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.lovable.app",
          ],
    ),
  },
};

const popupEntry = channel === "stable" ? "src/popup.stable.ts" : "src/popup.ts";

const entries = [
  { in: "src/background.ts", out: "dist/background.js" },
  { in: "src/content.ts",    out: "dist/content.js" },
  { in: "src/web-bridge.ts", out: "dist/web-bridge.js" },
  { in: popupEntry,          out: "dist/popup.js" },
];

async function buildAll() {
  await Promise.all(
    entries.map((e) =>
      esbuild.build({ ...common, entryPoints: [e.in], outfile: e.out }),
    ),
  );
  await copyStatic({ channel });
  console.log(`[browser-agent] build complete → dist/  (channel=${channel} build_date=${buildDate})`);
}

if (watch) {
  const ctxs = await Promise.all(
    entries.map((e) =>
      esbuild.context({ ...common, entryPoints: [e.in], outfile: e.out }),
    ),
  );
  await Promise.all(ctxs.map((c) => c.watch()));
  await copyStatic({ channel });
  console.log(`[browser-agent] watching... (channel=${channel})`);
} else {
  await buildAll();
}

// Build script for Radius Track Browser Agent (MV3).
// Bundles background/content/popup, copies static assets, injects BUILD_DATE.
import esbuild from "esbuild";
import { copyStatic } from "./scripts/copy-static.mjs";

const watch = process.argv.includes("--watch");
const buildDate = new Date().toISOString();
const commitSha = process.env.RT_COMMIT_SHA ?? "";

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "esm",
  target: ["chrome110"],
  logLevel: "info",
  sourcemap: true,
  minify: false,
  legalComments: "none",
  define: {
    "__RT_BUILD_DATE__": JSON.stringify(buildDate),
    "__RT_COMMIT_SHA__": JSON.stringify(commitSha),
  },
};

const entries = [
  { in: "src/background.ts", out: "dist/background.js" },
  { in: "src/content.ts",    out: "dist/content.js" },
  { in: "src/web-bridge.ts", out: "dist/web-bridge.js" },
  { in: "src/popup.ts",      out: "dist/popup.js" },
];

async function buildAll() {
  await Promise.all(
    entries.map((e) =>
      esbuild.build({ ...common, entryPoints: [e.in], outfile: e.out }),
    ),
  );
  await copyStatic();
  console.log(`[browser-agent] build complete → dist/  (build_date=${buildDate})`);
}

if (watch) {
  const ctxs = await Promise.all(
    entries.map((e) =>
      esbuild.context({ ...common, entryPoints: [e.in], outfile: e.out }),
    ),
  );
  await Promise.all(ctxs.map((c) => c.watch()));
  await copyStatic();
  console.log("[browser-agent] watching...");
} else {
  await buildAll();
}

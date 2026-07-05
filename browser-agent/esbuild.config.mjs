// Build script for Radius Track Browser Agent (MV3).
// Bundles src/background.ts and src/content.ts, then copies static assets.
import esbuild from "esbuild";
import { copyStatic } from "./scripts/copy-static.mjs";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "esm",
  target: ["chrome110"],
  logLevel: "info",
  sourcemap: true,
  minify: false,
  legalComments: "none",
};

const entries = [
  { in: "src/background.ts", out: "dist/background.js" },
  { in: "src/content.ts",    out: "dist/content.js" },
  { in: "src/popup.ts",      out: "dist/popup.js" },
];

async function buildAll() {
  await Promise.all(
    entries.map((e) =>
      esbuild.build({ ...common, entryPoints: [e.in], outfile: e.out }),
    ),
  );
  await copyStatic();
  console.log("[browser-agent] build complete → dist/");
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

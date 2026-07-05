// Package dist/ into a zip suitable for "Load unpacked" or manual distribution.
// Uses the system `zip` binary if present. Falls back to reporting instructions.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const outDir = path.join(root, "packaged");
const outFile = path.join(outDir, "radius-track-agent.zip");

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) rmSync(outFile);

const res = spawnSync("zip", ["-r", outFile, "."], { cwd: dist, stdio: "inherit" });
if (res.status !== 0) {
  console.error("`zip` failed or is not installed. Distribute dist/ as an unpacked folder instead.");
  process.exit(res.status ?? 1);
}
console.log("packaged →", outFile);

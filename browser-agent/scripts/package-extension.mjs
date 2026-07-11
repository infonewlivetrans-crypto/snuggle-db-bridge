// Package dist/ into a versioned zip and publish it to public/downloads/browser-agent
// so the app can serve the agent installer directly from the site (no manual copy).
// The archive contains ONLY dist/ — no dev deps, no .env, no source secrets.
//
// After a successful zip the script also:
//   - copies the zip into <repo>/public/downloads/browser-agent/
//   - regenerates public/downloads/browser-agent/latest.json
// Failures at any step abort without touching public/downloads.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(root); // one up from browser-agent/
const dist = path.join(root, "dist");
const outDir = path.join(root, "packaged");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const fileName = `radius-track-agent-${version}.zip`;
const outFile = path.join(outDir, fileName);
const publicDir = path.join(repoRoot, "public", "downloads", "browser-agent");
const publicFile = path.join(publicDir, fileName);
const latestJson = path.join(publicDir, "latest.json");

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}
if (!existsSync(path.join(dist, "manifest.json"))) {
  console.error("dist/manifest.json missing — refusing to package a broken build.");
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

// Copy the versioned zip into public/downloads so the site can serve it directly.
mkdirSync(publicDir, { recursive: true });
copyFileSync(outFile, publicFile);

const buf = readFileSync(publicFile);
const sha256 = createHash("sha256").update(buf).digest("hex");
const sizeBytes = statSync(publicFile).size;

// Preserve releaseNotes/minSupportedVersion/chromeWebStoreUrl if a previous latest.json exists.
let prev = {};
if (existsSync(latestJson)) {
  try {
    prev = JSON.parse(readFileSync(latestJson, "utf8"));
  } catch {
    prev = {};
  }
}

const latest = {
  latestVersion: version,
  minSupportedVersion:
    typeof prev.minSupportedVersion === "string" ? prev.minSupportedVersion : version,
  fileName,
  downloadUrl: `/downloads/browser-agent/${fileName}`,
  sizeBytes,
  sha256,
  publishedAt: new Date().toISOString(),
  releaseNotes: Array.isArray(prev.releaseNotes) ? prev.releaseNotes : [],
  chromeWebStoreUrl:
    typeof prev.chromeWebStoreUrl === "string" ? prev.chromeWebStoreUrl : null,
};
writeFileSync(latestJson, JSON.stringify(latest, null, 2) + "\n");
console.log("published →", publicFile);
console.log("updated  →", latestJson);

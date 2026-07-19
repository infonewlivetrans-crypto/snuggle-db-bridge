// Package dist/ into a versioned zip and publish it to public/downloads/browser-agent.
// The archive contains ONLY dist/ — no dev deps, no .env, no source secrets.
//
// For stable channel (RT_CHANNEL=stable): runs a forbidden-strings scan on
// dist/*.js and dist/*.json. If any forbidden marker is found — abort. This
// guarantees the production stable bundle does not carry dev URLs, mock
// helpers, dev popup buttons, or diagnostic UI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, rmSync, readFileSync, writeFileSync,
  copyFileSync, statSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(root);
const dist = path.join(root, "dist");
const outDir = path.join(root, "packaged");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const channel = process.env.RT_CHANNEL === "stable" ? "stable" : "dev";
const fileName = `radius-track-agent-${version}.zip`;
const outFile = path.join(outDir, fileName);
const publicDir = path.join(repoRoot, "public", "downloads", "browser-agent");
const publicFile = path.join(publicDir, fileName);
const latestJson = path.join(publicDir, "latest.json");

if (!existsSync(dist)) { console.error("dist/ not found — run build first."); process.exit(1); }
if (!existsSync(path.join(dist, "manifest.json"))) {
  console.error("dist/manifest.json missing — refusing to package broken build.");
  process.exit(1);
}

// Forbidden strings scan — only for stable channel.
// Any of these markers in the packaged bundle means dev leakage.
const FORBIDDEN = [
  "lovable.app",
  "snuggle-db-bridge",
  "ALLOW_MOCK_AGENT",
  "mockOpenAti",
  "mockRefreshTask",
  "/mock-",
  "Прочитать",     // legacy dev button
  "Отправить",     // legacy dev button
  "pairing-код",   // dev pairing input
  "Pairing code",  // dev pairing input
];

if (channel === "stable") {
  const files = readdirSync(dist).filter((f) => /\.(js|json|html)$/.test(f));
  const violations = [];
  for (const f of files) {
    const content = readFileSync(path.join(dist, f), "utf8");
    for (const marker of FORBIDDEN) {
      if (content.includes(marker)) {
        violations.push(`  ${f}: contains "${marker}"`);
      }
    }
  }
  if (violations.length > 0) {
    console.error("STABLE bundle contains forbidden strings — refusing to package:");
    for (const v of violations) console.error(v);
    process.exit(2);
  }
  console.log("[stable] forbidden-strings scan passed.");
}

mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) rmSync(outFile);

const res = spawnSync("zip", ["-r", outFile, "."], { cwd: dist, stdio: "inherit" });
if (res.status !== 0) {
  console.error("`zip` failed or not installed.");
  process.exit(res.status ?? 1);
}
console.log("packaged →", outFile);

// Publish to public/ only for stable channel — dev archives are not shipped to users.
if (channel !== "stable") {
  console.log(`[${channel}] skip publishing to public/downloads (dev builds are not shipped).`);
  process.exit(0);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(outFile, publicFile);

const buf = readFileSync(publicFile);
const sha256 = createHash("sha256").update(buf).digest("hex");
const sizeBytes = statSync(publicFile).size;

let prev = {};
if (existsSync(latestJson)) {
  try { prev = JSON.parse(readFileSync(latestJson, "utf8")); } catch { prev = {}; }
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

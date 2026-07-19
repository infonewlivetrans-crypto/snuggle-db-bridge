// Copy static assets into dist/.
// For stable channel: rewrites manifest.json to strip lovable.app hosts and
// dev naming, and copies popup.stable.html as popup.html.
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

const OPTIONAL_DIRS = ["icons"];

// Hosts allowed for the stable production channel — no lovable.app.
const STABLE_WEB_HOSTS = [
  "https://radius-track.ru/*",
  "https://www.radius-track.ru/*",
];

export async function copyStatic({ channel = "dev" } = {}) {
  await mkdir(dist, { recursive: true });

  // manifest.json — patch for stable
  const manifestSrc = path.join(root, "manifest.json");
  const manifestOut = path.join(dist, "manifest.json");
  if (existsSync(manifestSrc)) {
    const raw = await readFile(manifestSrc, "utf8");
    const m = JSON.parse(raw);
    if (channel === "stable") {
      m.name = "Radius Track Agent";
      if (m.description) m.description = m.description.replace(/^Dev-расширение/, "Расширение");
      // Restrict host_permissions
      m.host_permissions = (m.host_permissions ?? []).filter((h) =>
        !/lovable\.app|localhost|127\.0\.0\.1/.test(h),
      );
      // Restrict web-bridge matches on content_scripts
      if (Array.isArray(m.content_scripts)) {
        for (const cs of m.content_scripts) {
          if (Array.isArray(cs.js) && cs.js.includes("web-bridge.js")) {
            cs.matches = STABLE_WEB_HOSTS;
          }
        }
      }
    }
    await writeFile(manifestOut, JSON.stringify(m, null, 2));
  }

  // popup.html: stable uses popup.stable.html if present
  const popupStable = path.join(root, "popup.stable.html");
  const popupDev = path.join(root, "popup.html");
  const popupSrc = channel === "stable" && existsSync(popupStable) ? popupStable : popupDev;
  if (existsSync(popupSrc)) {
    await cp(popupSrc, path.join(dist, "popup.html"));
  }

  for (const d of OPTIONAL_DIRS) {
    const src = path.join(root, d);
    if (existsSync(src) && (await stat(src)).isDirectory()) {
      await cp(src, path.join(dist, d), { recursive: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const channel = process.env.RT_CHANNEL === "stable" ? "stable" : "dev";
  await copyStatic({ channel });
  console.log(`static copied (channel=${channel})`);
}

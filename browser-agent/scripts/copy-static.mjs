// Copy static assets into dist/.
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

const STATIC = ["manifest.json", "popup.html"];
const OPTIONAL_DIRS = ["icons"];

export async function copyStatic() {
  await mkdir(dist, { recursive: true });
  for (const f of STATIC) {
    const src = path.join(root, f);
    if (existsSync(src)) await cp(src, path.join(dist, f));
  }
  for (const d of OPTIONAL_DIRS) {
    const src = path.join(root, d);
    if (existsSync(src) && (await stat(src)).isDirectory()) {
      await cp(src, path.join(dist, d), { recursive: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await copyStatic();
  console.log("static copied");
}

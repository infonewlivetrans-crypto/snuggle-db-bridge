// Стабильный fingerprint фильтров search task.
// Изменение fingerprint => сбрасывать initial scan.

function canonicalize(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(canonicalize).sort();
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonicalize(v[k]);
    return out;
  }
  if (typeof v === "number") return Number(v.toFixed(6));
  if (typeof v === "string") return v.trim().toLowerCase();
  return v;
}

export function computeFilterFingerprint(filters) {
  const s = JSON.stringify(canonicalize(filters ?? {}));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

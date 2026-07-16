// Мини-semver сравнение. Корректно обрабатывает 0.2.9 vs 0.2.10.
// Возвращает: -1 если a<b, 0 если равно, 1 если a>b, null если один из аргументов невалиден.

const RE = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?\s*$/;

export function parseSemver(input: unknown): [number, number, number] | null {
  if (typeof input !== "string") return null;
  const m = RE.exec(input);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a: unknown, b: unknown): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export function isNewer(candidate: unknown, current: unknown): boolean {
  const cmp = compareSemver(candidate, current);
  return cmp === 1;
}

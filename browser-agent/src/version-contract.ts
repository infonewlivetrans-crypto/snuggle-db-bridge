// Локальная копия контракта совместимости для browser-agent.
// Идентична src/lib/ai-dispatcher/agent-version-contract.ts — обе стороны
// должны меняться синхронно. См. README раздел 14 «Что делать при несовместимой версии».

export const MINIMUM_AGENT_VERSION = "0.1.0";
export const RECOMMENDED_AGENT_VERSION = "0.2.0";
export const SUPPORTED_SELECTOR_CONFIG_VERSIONS: readonly string[] = ["dev-1"];
export const AGENT_PROTOCOL_VERSION = "1";

export type CompatibilityStatus =
  | "compatible"
  | "update_recommended"
  | "unsupported"
  | "protocol_mismatch"
  | "selector_config_warning";

export function compareVersions(a: string, b: string): number {
  const norm = (v: string) => v.replace(/^v/i, "").split(/[-+]/)[0].split(".").map((x) => {
    const n = parseInt(x, 10);
    return Number.isFinite(n) ? n : 0;
  });
  const A = norm(a); const B = norm(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0; const y = B[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function getAgentCompatibilityStatus(input: {
  agent_version?: string | null;
  protocol_version?: string | null;
  selector_config_version?: string | null;
}): { status: CompatibilityStatus; reasons: string[] } {
  const reasons: string[] = [];
  const av = input.agent_version ?? null;
  const pv = input.protocol_version ?? null;
  const scv = input.selector_config_version ?? null;
  let status: CompatibilityStatus = "compatible";
  if (pv && String(pv) !== AGENT_PROTOCOL_VERSION) {
    status = "protocol_mismatch";
    reasons.push(`protocol ${pv} ≠ ${AGENT_PROTOCOL_VERSION}`);
  } else if (!av || compareVersions(av, MINIMUM_AGENT_VERSION) < 0) {
    status = "unsupported";
    reasons.push(`agent ${av ?? "?"} < ${MINIMUM_AGENT_VERSION}`);
  } else if (compareVersions(av, RECOMMENDED_AGENT_VERSION) < 0) {
    status = "update_recommended";
    reasons.push(`recommended ${RECOMMENDED_AGENT_VERSION}`);
  } else if (scv && !SUPPORTED_SELECTOR_CONFIG_VERSIONS.includes(scv)) {
    status = "selector_config_warning";
    reasons.push(`selectors ${scv}?`);
  }
  return { status, reasons };
}

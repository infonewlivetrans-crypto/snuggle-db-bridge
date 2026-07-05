// Client-safe контракт совместимости Web ↔ Browser Agent.
// НЕЛЬЗЯ импортировать из .server.ts. Используется в клиентских панелях
// и в public health endpoint (через отдельный re-export helper).

export const CURRENT_WEB_VERSION = "0.2.0";
export const AGENT_PROTOCOL_VERSION = "1";
export const MINIMUM_AGENT_VERSION = "0.1.0";
export const RECOMMENDED_AGENT_VERSION = "0.2.0";
export const SUPPORTED_SELECTOR_CONFIG_VERSIONS: readonly string[] = ["dev-1"];

export type CompatibilityStatus =
  | "compatible"
  | "update_recommended"
  | "unsupported"
  | "protocol_mismatch"
  | "selector_config_warning";

/** SemVer-ish compare: возвращает -1 / 0 / 1. Игнорирует pre-release/build. */
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

export function isAgentVersionSupported(agentVersion: string | null | undefined): boolean {
  if (!agentVersion) return false;
  return compareVersions(agentVersion, MINIMUM_AGENT_VERSION) >= 0;
}

export function isProtocolCompatible(agentProtocol: string | null | undefined): boolean {
  if (!agentProtocol) return false;
  return String(agentProtocol) === AGENT_PROTOCOL_VERSION;
}

export function isSelectorConfigSupported(v: string | null | undefined): boolean {
  if (!v) return false;
  return SUPPORTED_SELECTOR_CONFIG_VERSIONS.includes(v);
}

export interface AgentCompatibilityInput {
  agent_version?: string | null;
  protocol_version?: string | null;
  selector_config_version?: string | null;
}

export interface AgentCompatibilityResult {
  status: CompatibilityStatus;
  reasons: string[];
  agent_version: string | null;
  minimum_agent_version: string;
  recommended_agent_version: string;
  protocol_version: string | null;
  selector_config_version: string | null;
}

export function getAgentCompatibilityStatus(input: AgentCompatibilityInput): AgentCompatibilityResult {
  const reasons: string[] = [];
  const av = input.agent_version ?? null;
  const pv = input.protocol_version ?? null;
  const scv = input.selector_config_version ?? null;
  let status: CompatibilityStatus = "compatible";

  if (pv && !isProtocolCompatible(pv)) {
    status = "protocol_mismatch";
    reasons.push(`несовместимый protocol ${pv}, требуется ${AGENT_PROTOCOL_VERSION}`);
  } else if (!isAgentVersionSupported(av)) {
    status = "unsupported";
    reasons.push(`версия агента ${av ?? "неизвестна"} ниже минимальной ${MINIMUM_AGENT_VERSION}`);
  } else if (av && compareVersions(av, RECOMMENDED_AGENT_VERSION) < 0) {
    status = "update_recommended";
    reasons.push(`рекомендуется обновиться до ${RECOMMENDED_AGENT_VERSION}`);
  } else if (scv && !isSelectorConfigSupported(scv)) {
    status = "selector_config_warning";
    reasons.push(`неизвестная версия селекторов ATI: ${scv}`);
  }

  return {
    status,
    reasons,
    agent_version: av,
    minimum_agent_version: MINIMUM_AGENT_VERSION,
    recommended_agent_version: RECOMMENDED_AGENT_VERSION,
    protocol_version: pv,
    selector_config_version: scv,
  };
}

/** Whitelist полей публичного health-ответа. Используется в тестах. */
export const PUBLIC_HEALTH_WHITELIST: readonly string[] = [
  "status",
  "current_web_version",
  "agent_protocol_version",
  "minimum_agent_version",
  "recommended_agent_version",
  "supported_selector_config_versions",
  "server_time",
];

export function buildPublicHealthPayload(): Record<string, unknown> {
  return {
    status: "ok",
    current_web_version: CURRENT_WEB_VERSION,
    agent_protocol_version: AGENT_PROTOCOL_VERSION,
    minimum_agent_version: MINIMUM_AGENT_VERSION,
    recommended_agent_version: RECOMMENDED_AGENT_VERSION,
    supported_selector_config_versions: [...SUPPORTED_SELECTOR_CONFIG_VERSIONS],
    server_time: new Date().toISOString(),
  };
}

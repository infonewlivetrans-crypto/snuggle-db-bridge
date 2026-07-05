// Client-safe web-bridge клиент. Общается с content script расширения через window.postMessage.
// НЕ хранит agent token. НЕ вставляет token в DOM/URL/localStorage/console.
// Используется только на Web-страницах Радиус Трек, работает в браузере пользователя.

export interface AgentStatus {
  installed: boolean;
  connected: boolean;
  agentVersion?: string;
  protocolVersion?: string;
  sessionStatus?: string;
  lastHeartbeatAt?: string | null;
  needsReconnect?: boolean;
  errorCode?: string;
}

export interface ConnectionResult {
  ok: boolean;
  connected: boolean;
  sessionStatus?: string;
  agentVersion?: string;
  errorCode?: string;
  errorMessage?: string;
}

const MSG_NS = "RT_BRIDGE";
const DEFAULT_TIMEOUT_MS = 1500;

function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface EnvelopeReq {
  ns: typeof MSG_NS;
  dir: "web->ext";
  requestId: string;
  nonce: string;
  type: string;
  payload?: Record<string, unknown>;
}

interface EnvelopeResp {
  ns: typeof MSG_NS;
  dir: "ext->web";
  requestId: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function isEnvelopeResp(x: unknown): x is EnvelopeResp {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.ns === MSG_NS && o.dir === "ext->web" && typeof o.requestId === "string";
}

async function sendBridgeMessage(
  type: string,
  payload: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, error: "no_window" };
  }
  const requestId = randomId();
  const nonce = randomId();
  const req: EnvelopeReq = { ns: MSG_NS, dir: "web->ext", requestId, nonce, type, payload };

  return new Promise((resolve) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, error: "timeout" });
    }, timeoutMs);

    function onMessage(ev: MessageEvent) {
      if (ev.source !== window) return;
      if (ev.origin !== window.location.origin) return;
      if (!isEnvelopeResp(ev.data)) return;
      if (ev.data.requestId !== requestId) return;
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve({ ok: ev.data.ok, data: ev.data.data, error: ev.data.error });
    }
    window.addEventListener("message", onMessage);
    window.postMessage(req, window.location.origin);
  });
}

export async function detectExtension(timeoutMs?: number): Promise<AgentStatus> {
  const res = await sendBridgeMessage("RT_AGENT_PING", {}, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok || !res.data) return { installed: false, connected: false };
  const d = res.data;
  return {
    installed: Boolean(d.installed ?? true),
    connected: Boolean(d.connected ?? false),
    agentVersion: typeof d.agentVersion === "string" ? d.agentVersion : undefined,
    protocolVersion: typeof d.protocolVersion === "string" ? d.protocolVersion : undefined,
    sessionStatus: typeof d.sessionStatus === "string" ? d.sessionStatus : undefined,
    lastHeartbeatAt: typeof d.lastHeartbeatAt === "string" ? d.lastHeartbeatAt : null,
    needsReconnect: Boolean(d.needsReconnect ?? false),
  };
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const res = await sendBridgeMessage("RT_AGENT_STATUS", {});
  if (!res.ok || !res.data) return { installed: false, connected: false };
  const d = res.data;
  return {
    installed: Boolean(d.installed ?? true),
    connected: Boolean(d.connected ?? false),
    agentVersion: typeof d.agentVersion === "string" ? d.agentVersion : undefined,
    protocolVersion: typeof d.protocolVersion === "string" ? d.protocolVersion : undefined,
    sessionStatus: typeof d.sessionStatus === "string" ? d.sessionStatus : undefined,
    lastHeartbeatAt: typeof d.lastHeartbeatAt === "string" ? d.lastHeartbeatAt : null,
    needsReconnect: Boolean(d.needsReconnect ?? false),
    errorCode: typeof d.errorCode === "string" ? d.errorCode : undefined,
  };
}

export interface RequestConnectionInput {
  challengeId: string;
  challengeSecret: string;
  origin: string;
}

export async function requestAgentConnection(
  input: RequestConnectionInput,
  timeoutMs = 10_000,
): Promise<ConnectionResult> {
  const res = await sendBridgeMessage(
    "RT_AGENT_CONNECT_REQUEST",
    {
      challenge_id: input.challengeId,
      challenge_secret: input.challengeSecret,
      origin: input.origin,
    },
    timeoutMs,
  );
  if (!res.ok || !res.data) {
    return { ok: false, connected: false, errorCode: res.error ?? "bridge_failed" };
  }
  const d = res.data;
  return {
    ok: Boolean(d.ok ?? true),
    connected: Boolean(d.connected ?? false),
    sessionStatus: typeof d.sessionStatus === "string" ? d.sessionStatus : undefined,
    agentVersion: typeof d.agentVersion === "string" ? d.agentVersion : undefined,
    errorCode: typeof d.errorCode === "string" ? d.errorCode : undefined,
    errorMessage: typeof d.errorMessage === "string" ? d.errorMessage : undefined,
  };
}

export async function disconnectAgent(): Promise<{ ok: boolean; error?: string }> {
  const res = await sendBridgeMessage("RT_AGENT_DISCONNECT", {}, 5000);
  return { ok: res.ok, error: res.error };
}

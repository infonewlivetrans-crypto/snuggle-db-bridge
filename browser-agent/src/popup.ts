// Radius Track Agent popup — TypeScript source. Bundled to dist/popup.js.
/// <reference types="chrome" />
import { AGENT_VERSION, AGENT_PROTOCOL_VERSION, ATI_SELECTOR_CONFIG_VERSION, BUILD_CHANNEL, BUILD_DATE } from "./version";
import {
  getAgentCompatibilityStatus, RECOMMENDED_AGENT_VERSION, MINIMUM_AGENT_VERSION,
} from "./version-contract";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

async function send<T = unknown>(msg: unknown): Promise<T> {
  return new Promise((r) => chrome.runtime.sendMessage(msg, (resp) => r(resp as T)));
}
function fmt(ts?: string): string { return ts ? new Date(ts).toLocaleTimeString() : "—"; }

function validateBaseUrl(u: string): { ok: boolean; reason?: string } {
  if (!u) return { ok: false, reason: "empty" };
  if (!/^https?:\/\//i.test(u)) return { ok: false, reason: "must start with http(s)://" };
  if (/^(javascript|file|data):/i.test(u)) return { ok: false, reason: "unsafe scheme" };
  try { new URL(u); return { ok: true }; } catch { return { ok: false, reason: "invalid URL" }; }
}

interface StatusResp {
  rt_agent_token?: string;
  rt_session_id?: string;
  rt_last_heartbeat?: string;
  rt_last_error?: string;
  rt_last_visible_count?: string;
  rt_last_sent_count?: string;
  rt_last_suitable_count?: string;
  rt_last_read_at?: string;
  rt_current_task_id?: string;
  rt_base_url?: string;
  rt_next_refresh_at?: string;
  rt_waiting_login_tasks_v1?: string;
}

$("verSub").textContent = `v${AGENT_VERSION} · protocol ${AGENT_PROTOCOL_VERSION} · ${BUILD_CHANNEL}`;

function renderMeta(): void {
  const compat = getAgentCompatibilityStatus({
    agent_version: AGENT_VERSION,
    protocol_version: AGENT_PROTOCOL_VERSION,
    selector_config_version: ATI_SELECTOR_CONFIG_VERSION,
  });
  const labels: Record<string, string> = {
    compatible: "Версия актуальна",
    update_recommended: "Рекомендуется обновить",
    unsupported: "Версия не поддерживается",
    protocol_mismatch: "Несовместимая версия протокола",
    selector_config_warning: "Неизвестная версия селекторов",
  };
  $("meta").innerHTML = [
    `agent_version: <b>${AGENT_VERSION}</b>`,
    `protocol: ${AGENT_PROTOCOL_VERSION} · selectors: ${ATI_SELECTOR_CONFIG_VERSION}`,
    `channel: ${BUILD_CHANNEL} · build_date: ${BUILD_DATE || "—"}`,
    `min: ${MINIMUM_AGENT_VERSION} · рекоменд.: ${RECOMMENDED_AGENT_VERSION}`,
    `<span class="compat-${compat.status}">Совместимость: ${labels[compat.status]}</span>`,
  ].join("<br/>");
}

async function refresh(): Promise<void> {
  const s = await send<StatusResp>({ type: "rt/status" });
  const connected = Boolean(s?.rt_agent_token);
  let waiting = 0;
  try {
    const raw = s?.rt_waiting_login_tasks_v1;
    if (raw) waiting = Object.keys(JSON.parse(raw)).length;
  } catch { /* ignore */ }
  let statusLabel = "Не подключён";
  if (connected) {
    if (waiting > 0) statusLabel = "Нужно войти в ATI";
    else if (s?.rt_last_read_at) statusLabel = "Идёт поиск";
    else statusLabel = "Готов";
  }
  const cls = connected ? (waiting > 0 ? "err" : "ok") : "muted";
  $("status").innerHTML = `<span class="${cls}">${statusLabel}</span>`
    + (s?.rt_last_error ? `<br/><span class="err">${s.rt_last_error}</span>` : "");
  const visible = s?.rt_last_visible_count ?? "—";
  const sent = s?.rt_last_sent_count ?? "—";
  const suitable = s?.rt_last_suitable_count ?? "—";
  const at = s?.rt_last_read_at ? fmt(s.rt_last_read_at) : "—";
  const nextAt = s?.rt_next_refresh_at ? fmt(s.rt_next_refresh_at) : "—";
  $("live").innerHTML = `Активных задач: <b>${s?.rt_current_task_id ? 1 : 0}</b>`
    + ` · Найдено: <b>${visible}</b> · Подходит: <b>${suitable}</b>`
    + `<br/>Отправлено: <b>${sent}</b>`
    + `<br/>Последняя проверка: ${at}`
    + `<br/>Следующая проверка: ${nextAt}`;
  if (s?.rt_base_url) ($("baseUrl") as HTMLInputElement).value = s.rt_base_url;
  renderMeta();
}

$("pair").addEventListener("click", async () => {
  const baseUrl = ($("baseUrl") as HTMLInputElement).value.trim().replace(/\/$/, "");
  const code = ($("code") as HTMLInputElement).value.trim();
  const v = validateBaseUrl(baseUrl);
  if (!v.ok) { alert("Некорректный URL Радиус Трек: " + v.reason); return; }
  if (!code) { alert("Введите pairing-код"); return; }
  const res = await send<{ ok?: boolean; error?: string }>({ type: "rt/pair", baseUrl, pairing_code: code });
  if (res?.ok) { ($("code") as HTMLInputElement).value = ""; refresh(); }
  else alert("Ошибка: " + (res?.error ?? "unknown"));
});
$("testConn").addEventListener("click", async () => {
  const baseUrl = ($("baseUrl") as HTMLInputElement).value.trim().replace(/\/$/, "");
  const v = validateBaseUrl(baseUrl);
  if (!v.ok) { alert("URL: " + v.reason); return; }
  try {
    const r = await fetch(`${baseUrl}/api/public/agent/ai-dispatcher/health`);
    const data = await r.json().catch(() => ({}));
    alert(`Public health ${r.status}\n\n` + JSON.stringify(data, null, 2));
  } catch (e) { alert("Ошибка: " + (e as Error).message); }
});
$("openApp").addEventListener("click", async () => {
  const baseUrl = ($("baseUrl") as HTMLInputElement).value.trim().replace(/\/$/, "");
  if (!validateBaseUrl(baseUrl).ok) return;
  chrome.tabs.create({ url: `${baseUrl}/dispatcher/ai-dispatcher` });
});
$("disconnect").addEventListener("click", async () => { await send({ type: "rt/disconnect" }); refresh(); });
$("read").addEventListener("click", async () => {
  const res = await send<{ ok?: boolean; visible?: number; sent?: number; suitable?: number; error?: string }>({ type: "rt/read-current-page" });
  if (res?.ok) { refresh(); alert(`Прочитано: ${res.visible}. Отправлено: ${res.sent}. Подходит: ${res.suitable}`); }
  else alert("Ошибка: " + (res?.error ?? "unknown"));
});
$("diag").addEventListener("click", async () => {
  const res = await send<{ ok?: boolean; diagnostics?: unknown; error?: string }>({ type: "rt/diagnostics" });
  if (res?.diagnostics) {
    const txt = JSON.stringify(res.diagnostics, null, 2);
    alert("Диагностика (безопасная):\n\n" + txt.slice(0, 1200));
  } else alert("Ошибка: " + (res?.error ?? "unknown"));
});
$("copyDiag").addEventListener("click", async () => {
  const res = await send<{ ok?: boolean; diagnostics?: unknown }>({ type: "rt/diagnostics" });
  const txt = JSON.stringify(res?.diagnostics ?? {}, null, 2);
  try { await navigator.clipboard.writeText(txt); alert("Скопировано в буфер"); }
  catch { alert("Не удалось скопировать"); }
});
$("overlayOn").addEventListener("click", async () => { await send({ type: "rt/show-overlay" }); });
$("overlayOff").addEventListener("click", async () => { await send({ type: "rt/hide-overlay" }); });
$("mock").addEventListener("click", async () => {
  const res = await send<{ ok?: boolean; sent?: number; suitable?: number; error?: string }>({ type: "rt/send-mock-loads" });
  if (res?.ok) { refresh(); alert(`Отправлено: ${res.sent}. Подходит: ${res.suitable}`); }
  else alert("Ошибка: " + (res?.error ?? "unknown"));
});

refresh();
setInterval(refresh, 5000);

const openAtiBtn = document.getElementById("openAti");
if (openAtiBtn) openAtiBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://ati.su/loads/" });
});

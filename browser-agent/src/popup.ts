// Radius Track Agent popup — TypeScript source. Bundled to dist/popup.js.
/// <reference types="chrome" />

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
}

async function refresh(): Promise<void> {
  const s = await send<StatusResp>({ type: "rt/status" });
  const connected = Boolean(s?.rt_agent_token);
  $("status").innerHTML = connected
    ? `<span class="ok">Подключено</span><br/>session: ${s.rt_session_id || "?"}<br/>heartbeat: ${fmt(s.rt_last_heartbeat)}${s.rt_last_error ? `<br/><span class="err">${s.rt_last_error}</span>` : ""}`
    : `<span class="muted">Не подключено</span>`;
  const visible = s?.rt_last_visible_count ?? "—";
  const sent = s?.rt_last_sent_count ?? "—";
  const suitable = s?.rt_last_suitable_count ?? "—";
  const at = s?.rt_last_read_at ? fmt(s.rt_last_read_at) : "—";
  const task = s?.rt_current_task_id ?? "—";
  $("live").innerHTML = `Задача: ${task}<br/>Видно: <b>${visible}</b> · Отправлено: <b>${sent}</b> · Подходит: <b>${suitable}</b><br/>Последнее чтение: ${at}`;
  if (s?.rt_base_url) ($("baseUrl") as HTMLInputElement).value = s.rt_base_url;
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
    const r = await fetch(`${baseUrl}/api/public/agent.ai-dispatcher/health`, { method: "GET" }).catch(() => null);
    alert(r ? `Ответ: ${r.status}` : "Сервер недоступен");
  } catch (e) { alert("Ошибка: " + (e as Error).message); }
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
    try { await navigator.clipboard.writeText(txt); } catch { /* noop */ }
    alert("Диагностика скопирована в буфер.\n\n" + txt.slice(0, 400));
  } else alert("Ошибка: " + (res?.error ?? "unknown"));
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

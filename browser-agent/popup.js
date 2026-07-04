// Radius Track Agent popup logic.
/* global chrome */
const $ = (id) => document.getElementById(id);

async function send(msg) {
  return new Promise((r) => chrome.runtime.sendMessage(msg, r));
}
function fmt(ts) { return ts ? new Date(ts).toLocaleTimeString() : "—"; }

async function refresh() {
  const s = await send({ type: "rt/status" });
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
  if (s?.rt_base_url) $("baseUrl").value = s.rt_base_url;
}

$("pair").addEventListener("click", async () => {
  const baseUrl = $("baseUrl").value.trim().replace(/\/$/, "");
  const code = $("code").value.trim();
  if (!baseUrl || !code) return alert("Введите base URL и код");
  const res = await send({ type: "rt/pair", baseUrl, pairing_code: code });
  if (res?.ok) { $("code").value = ""; refresh(); }
  else alert("Ошибка: " + (res?.error ?? "unknown"));
});
$("disconnect").addEventListener("click", async () => { await send({ type: "rt/disconnect" }); refresh(); });
$("read").addEventListener("click", async () => {
  const res = await send({ type: "rt/read-current-page" });
  if (res?.ok) { refresh(); alert(`Прочитано: ${res.visible}. Отправлено: ${res.sent}. Подходит: ${res.suitable}`); }
  else alert("Ошибка: " + (res?.error ?? "unknown"));
});
$("overlayOn").addEventListener("click", async () => { await send({ type: "rt/show-overlay" }); });
$("overlayOff").addEventListener("click", async () => { await send({ type: "rt/hide-overlay" }); });
$("mock").addEventListener("click", async () => {
  const res = await send({ type: "rt/send-mock-loads" });
  if (res?.ok) { refresh(); alert(`Отправлено грузов: ${res.sent}. Подходит: ${res.suitable}`); }
  else alert("Ошибка: " + (res?.error ?? "unknown"));
});

refresh();
setInterval(refresh, 5000);

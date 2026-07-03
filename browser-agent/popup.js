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
$("mock").addEventListener("click", async () => {
  const res = await send({ type: "rt/send-mock-loads" });
  alert(res?.ok ? `Отправлено грузов: ${res.sent}` : `Ошибка: ${res?.error}`);
});

refresh();

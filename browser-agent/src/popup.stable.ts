// Radius Track Agent — production popup (stable channel).
// Показывает только пользовательские данные: подключение агента, ATI,
// активный поиск, счётчики. Никаких dev-полей и служебных кнопок.
// См. этап A production cleanup 0.2.7.
/// <reference types="chrome" />
import { AGENT_VERSION } from "./version";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

async function send<T = unknown>(msg: unknown): Promise<T> {
  return new Promise((r) => chrome.runtime.sendMessage(msg, (resp) => r(resp as T)));
}

interface StatusResp {
  rt_agent_token?: string;
  rt_session_id?: string;
  rt_last_heartbeat?: string;
  rt_last_visible_count?: string;
  rt_last_suitable_count?: string;
  rt_last_read_at?: string;
  rt_current_task_id?: string;
  rt_base_url?: string;
  rt_waiting_login_tasks_v1?: string;
  rt_user_display_name?: string;
  rt_ati_display_name?: string;
  rt_ati_account_code?: string;
  rt_ati_login_required?: string;
}

const PROD_BASE = "https://radius-track.ru";

$("verSub").textContent = `v${AGENT_VERSION}`;

async function refresh(): Promise<void> {
  const s = await send<StatusResp>({ type: "rt/status" });
  const connected = Boolean(s?.rt_agent_token);
  let waiting = 0;
  try {
    const raw = s?.rt_waiting_login_tasks_v1;
    if (raw) waiting = Object.keys(JSON.parse(raw)).length;
  } catch { /* ignore */ }

  let statusLabel = "Не подключён";
  let cls: "ok" | "err" | "muted" = "muted";
  if (connected) {
    if (waiting > 0 || s?.rt_ati_login_required === "1") {
      statusLabel = "Нужно войти в ATI";
      cls = "err";
    } else if (s?.rt_current_task_id) {
      statusLabel = "Идёт поиск";
      cls = "ok";
    } else {
      statusLabel = "Готов";
      cls = "ok";
    }
  }
  $("status").innerHTML = `<span class="${cls}">${statusLabel}</span>`;
  $("rtUser").textContent = s?.rt_user_display_name || (connected ? "—" : "не подключён");

  const atiName = s?.rt_ati_display_name || "";
  const atiCode = s?.rt_ati_account_code || "";
  if (s?.rt_ati_login_required === "1") {
    $("atiState").innerHTML = `<span class="err">требуется вход</span>`;
  } else if (atiName || atiCode) {
    $("atiState").textContent = [atiName, atiCode ? `код ${atiCode}` : ""].filter(Boolean).join(" · ");
  } else {
    $("atiState").textContent = connected ? "не подтверждён" : "—";
  }

  $("activeSearch").textContent = s?.rt_current_task_id ? "поиск запущен" : "нет";
  $("counters").textContent = `${s?.rt_last_visible_count ?? "—"} / ${s?.rt_last_suitable_count ?? "—"}`;
}

$("openApp").addEventListener("click", () => {
  chrome.tabs.create({ url: `${PROD_BASE}/dispatcher/ai-dispatcher` });
});
$("openAti").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://loads.ati.su/" });
});

refresh();
setInterval(refresh, 5000);

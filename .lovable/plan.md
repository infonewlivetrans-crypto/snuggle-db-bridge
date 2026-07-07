# Подблок 4B — Финальная интеграция Browser Agent 0.2.2

Работа только в Lovable/dev. Никакого service_role. RLS не отключается. VPS/production, nginx, PM2, DNS, ЭПД/ЭДО не затрагиваются.

## 1. Миграция БД: атомарный advance

Новая миграция создаёт SECURITY DEFINER RPC (search_path = public):

- `public.agent_advance_orchestration_after_command(_token_hash text, _command_id uuid, _outcome text, _result_json jsonb, _error_message text) returns jsonb`

Внутри RPC:
1. По `_token_hash` находит `ai_dispatch_agent_sessions` (active).
2. Находит `ai_dispatch_agent_commands` по `_command_id` и `session_id`.
3. `SELECT ... FOR UPDATE` по `ai_dispatch_search_tasks` (задача команды).
4. Идемпотентность: если `orchestration_current_command_id != _command_id` или задача уже paused/stopped/suitable_found — возвращает `{status:'already_processed'}`.
5. Проверяет `command_payload_json->>'orchestration_run_id' = task.orchestration_run_id`; иначе — `stale_ignored`.
6. Для outcome `completed` определяет следующий `commandType` по чистой SQL-таблице (open_ati→apply_filters→start_search→read_visible_loads→null). Создаёт следующую команду с полным payload (orchestration_run_id, step, search_task_id, vehicle_params_json, ati_filters_json, main_load_candidate_id, route_points_json, cargo_capacity_left_json, refresh_interval_seconds) и обновляет `orchestration_current_command_id`, `orchestration_status`, `orchestration_updated_at`.
7. Для `failed`/`expired` — `orchestration_status='failed'`, `orchestration_error_code` (agent_timeout при expired).
8. Для `login_required` — `orchestration_status='waiting_user_login'`, следующая команда НЕ создаётся.
9. Возвращает UI-safe payload: `{status, next_command_id?, next_command_type?, orchestration_status, orchestration_error_code?}`.
10. `GRANT EXECUTE ... TO anon, authenticated` (агент вызывает публично, авторизация через token_hash внутри).

Также RPC `public.agent_resume_after_ati_login(_token_hash, _search_task_id, _orchestration_run_id)` — атомарно создаёт apply_filters при `waiting_user_login` и совпадении run_id; повторный вызов → `already_processed`.

## 2. Public agent callback hook

`src/routes/api/public/agent.ai-dispatcher.$.ts`:
- В обработчиках `command_completed`/`failed`/`expired` — после сохранения статуса команды вызывает RPC `agent_advance_orchestration_after_command`.
- Новый action `ati_login_required` → outcome=login_required.
- Новый action `ati_login_detected` → вызывает `agent_resume_after_ati_login`.
- Возвращает агенту `{ok:true, next_command:{id,type}?, orchestration_status}` (без dispatcher_id, email, token).

Ленивый advance в `getSearchOrchestrationStatus` остаётся как read-only fallback.

## 3. Search Orchestrator server

`src/server/ai-dispatcher/search-orchestrator.server.ts`:
- `startSearchOrchestration` создаёт open_ati с полным payload (включая `orchestration_run_id`).
- `handleCommandCompleted/Failed/Expired`, `handleAtiLoginRequired`, `resumeAfterAtiLogin` становятся тонкими обёртками вокруг RPC (для внутренних вызовов из UI-функций тоже проходят через RPC, чтобы не было двух путей).
- `pause/stop/retry/getStatus` — без изменений (retry генерирует новый `orchestration_run_id`).

Новый защищённый agent endpoint:
`GET /api/public/agent/ai-dispatcher/tasks/:id/scheduler-status` — по Bearer token агента, возвращает whitelisted поля: task_id, active, status, orchestration_status, auto_refresh_enabled, refresh_interval_seconds, next_refresh_at, search_mode, should_stop_scheduler.

## 4. Browser Agent 0.2.2

Версия bumped: `version.ts`, `manifest.json`, `package.json`, popup, build-info, README, MANUAL_TEST_CHECKLIST.

### content.ts
- Импортирует `detectAtiAuthState` из `ati/detectAuthState.ts`.
- Обработчики сообщений: `RT_DETECT_ATI_AUTH` → возвращает текущее состояние.
- MutationObserver с debounce 500ms, шлёт `RT_ATI_AUTH_STATE_CHANGED` только при переходе login_required↔authenticated (кэширует последнее отправленное состояние в модуле).

### background.ts
- При command `open_ati/apply_filters/start_search` перед выполнением вызывает `detectAtiAuthState` в managed tab. Если `login_required` — шлёт callback `ati_login_required`, не выполняет команду.
- Слушает `RT_ATI_AUTH_STATE_CHANGED` из content; при переходе `→authenticated` и наличии waiting task в storage → шлёт `ati_login_detected` серверу.
- При успешном `read_visible_loads` (первом) — вызывает `scheduleTaskRefresh` из `search-scheduler.ts`.
- `chrome.alarms.onAlarm`: `parseAlarmName` → `lockTaskRefresh` (try/finally) → GET scheduler-status → проверки stop-условий → auth check → refresh_page + read_visible_loads → POST loads → scoring → обновляет lastRefreshAt/nextRefreshAt.
- `restoreOnStart`: `restoreManagedTabs` + `restoreActiveSearchSchedules` + verify через `chrome.tabs.get`.
- Managed tab protection: закрывает/использует только при `createdByAgent===true` && `searchTaskId===expected`.

### popup.ts / popup.html
- Основной блок: версия 0.2.2, статус подключения, статус ATI, активных машин, найдено грузов, подходит, последняя/следующая проверка. Кнопки: «Открыть Радиус Трек», «Открыть ATI», «Диагностика» (toggle details).
- `<details>Диагностика</details>` — base URL, protocol, ручной pairing, selector config, counters.

## 5. Pure test modules и тесты

Новые:
- `browser-agent/src/shared/scheduler-state.mjs` — normalizeRefresh, shouldStopScheduler(taskStatus), lock helpers контракта.
- `browser-agent/src/shared/auth-state-transition.mjs` — pure `shouldEmitAuthTransition(prev, next)`.
- `browser-agent/src/shared/managed-tab-rules.mjs` — `canCloseTab(record, expectedTaskId)`.

Тесты (`browser-agent/tests/`):
- `scheduler-state.test.mjs` — сценарии 11–13, 15–20.
- `auth-state-transition.test.mjs` — сценарии 26–30.
- `managed-tab-rules.test.mjs` — сценарии 23–25, 31.
- Дополняем существующий `orchestrator-transitions.test.mjs` сценариями 1–10 (в pure форме, симулируя in-memory state machine — RPC как таковой не тестируется через node:test).

## 6. Simple UI

Минимальные изменения в `SimpleAgentPanel.tsx` / `SearchProgressBlock.tsx`:
- Новые статусы: «Нужно войти в ATI», «Продолжаю поиск», «Соединение восстановлено», «Последняя проверка HH:MM», «Следующая проверка HH:MM».
- Никаких command_id/run_id в основном UI.

## 7. Packaging

`browser-agent/scripts/package-extension.mjs` → `browser-agent/packaged/radius-track-agent-0.2.2.zip`. Архивы 0.2.0 и 0.2.1 сохраняются.

## 8. Verification

- `bunx tsgo --noEmit`
- `cd browser-agent && npm run typecheck && npm run build && npm test && npm run package`
- Проверка dist/ (background.js, content.js, web-bridge.js, popup.js, manifest.json v0.2.2, icons).

## Технические детали

**RPC не использует service_role** — SECURITY DEFINER с `search_path = public`, авторизация по `token_hash` (sha256 от agent_token, hash уже хранится в `ai_dispatch_agent_sessions.token_hash`).

**Идемпотентность**: атомарность гарантируется `FOR UPDATE` на search_task + проверкой `orchestration_current_command_id`. Второй одновременный callback увидит уже обновлённый current_command_id и вернёт `already_processed`.

**Managed tab safety**: `createdByAgent` в storage — никогда не закрываем/используем tabs без этой пометки.

**Missing candidates safety**: scheduler вызывает POST /loads только после успешного extraction + authenticated + распознанной страницы ATI.

## Область, которую не трогаем

`src/lib/edo/*`, кабинеты carrier/driver/forwarder, карта/GPS, очередь звонков, ЭПД/ЭДО, `src/integrations/supabase/client.ts`, `types.ts` (регенерируется автоматически после миграции).

## Что останется на ручную проверку

- Реальные селекторы ATI (форма фильтров, кнопка поиска, список грузов, user-menu) — проверяются вручную на установленном 0.2.2 против живой ATI по `MANUAL_TEST_CHECKLIST.md`.
- Наблюдение за таймингом minute-cycle scheduler при закрытой вкладке Radius Track.

## Этап «ЭПД-мастер сценариев» — план реализации

Большой этап, выполняем одним пакетом в dev-режиме Lovable (без VPS, без live-вызовов Saby/1С/ГосЛог).

### 1. Миграции БД

Создаю 3 новые таблицы (RLS включён, GRANT для authenticated/service_role, без anon):

- `edo_scenarios` — сценарий ЭПД, привязан к `carrier_ext_id` + опционально `trip_id`/`deal_id`/`document_id`. Поля: `scenario_type`, `forwarder_id`, `forwarder_possession_mode`, `cargo_holder_role`, `required_documents jsonb`, `participants_json jsonb`, `signing_plan_json jsonb`, `readiness_status`, `validation_errors jsonb`, `validation_warnings jsonb`, `is_training bool`.
- `carrier_epd_readiness` — одна строка на carrier_ext_id: `edo_operator`, `has_1c`, `has_1c_edo`, `has_1c_epd`, `onec_epd_tariff`, `edo_participant_id`, `has_director_kep`, `has_mchd`, `responsible_person`, `driver_has_smartphone`, `driver_qr_ready`, `readiness_status`, `last_checked_at`, `notes`.
- `forwarder_goslog_status` — `forwarder_id` (ссылка на carriers/companies, опционально), `inn`, `ogrn`, `company_name`, `okved_codes jsonb`, `has_okved_5229`, `goslog_status`, `registry_number`, `application_number`, `application_date`, `included_at`, `source_url`, `verified_by`, `verified_at`, `verification_comment`.
- `edo_training_sessions` — `user_id`, `role`, `scenario_type`, `current_step`, `status`, `progress_percent`, `mistakes_json`, `completed_at`.

Поля `carrier_epd_readiness_snapshot`, `scenario_id` добавляются в `carrier_edo_documents` (jsonb + uuid nullable) — для связи со сценарием и snapshot готовности на момент отправки.

RLS: всё через `carrier_my_ext_id()` и `auth.uid()`. Без service_role.

### 2. Серверный слой (`src/server/edo/`)

- `scenarios.server.ts` — CRUD сценариев, `validateScenario` (возвращает errors/warnings), `createDocumentsFromScenario` (заготовки документов по списку required_documents).
- `epd-readiness.server.ts` — GET/PATCH готовности перевозчика, вычисление `readiness_status`.
- `goslog.server.ts` — ручная фиксация статуса ГосЛог (без live).
- `training.server.ts` — start/step/complete; жёсткий `is_training=true`.
- `scenario-catalog.ts` — справочник 8 сценариев, для каждого: required_documents, signing_plan, участники, риски.

В `saby-actions.server.ts` (`sabyPrepareDocument`) — добавить чтение `scenario_id` документа, вызвать `validateScenario`, в payload передавать `scenario_type`, `forwarder_possession_mode`, `required_documents`, `signing_plan`, `cargo_holder_role`, `goslog_status_snapshot`, `epd_readiness_snapshot`, `is_training`. При наличии критических ошибок — вернуть `{ ok:false, errors }` и НЕ переводить в `prepared`.

### 3. API (TanStack server routes под `src/routes/api/`)

Перевозчик:
- `carrier/edo/readiness.ts` (GET/PATCH)
- `carrier/edo/scenarios.ts` (GET/POST)
- `carrier/edo/scenarios.$id.ts` (GET/PATCH)
- `carrier/edo/scenarios.$id.validate.ts` (POST)
- `carrier/edo/scenarios.$id.create-documents.ts` (POST)
- `carrier/edo/training.start.ts`, `training.$id.step.ts`, `training.$id.complete.ts`

Экспедитор:
- `forwarder/epd.ts`, `forwarder/goslog-status.ts`, `forwarder/epd.training.start.ts`

Диспетчер:
- `dispatcher/epd/readiness.ts`, `dispatcher/forwarders.goslog-status.ts`, `dispatcher/forwarders.$id.goslog-status.ts`, `dispatcher/carriers.$id.epd-readiness.ts`

### 4. UI

Константы и каталог сценариев — `src/lib/edo/scenarios.ts` (тексты на русском, метки документов, статусы).

Компоненты в `src/components/edo/`:
- `EpdScenarioWizard` (12 шагов, шаг = отдельный sub-component)
- `EpdScenarioStepParticipants`, `EpdScenarioStepDocuments`, `EpdScenarioStepSigningPlan`
- `EpdReadinessBadge`, `CarrierEpdReadinessBlock`
- `ForwarderGoslogBadge`, `ForwarderGoslogBlock`
- `EpdValidationPanel`, `EpdDocumentTimeline`, `DriverQrMockBlock`, `CargoRemarksBlock`, `EpdTrainingBlock`

Встраивание:
- `carrier.edo.$id.tsx` — сверху блок «Сценарий ЭПД» + EpdValidationPanel; кнопки Saby оборачиваются проверкой scenario_id.
- `carrier.edo.tsx` — вкладка/секция «Готовность к ЭПД» + «Тренажёр».
- `carrier.trips.tsx` (`CarrierTripEdoBlock`) — кнопка «Открыть Мастер ЭПД».
- `forwarder.tsx` — две секции `/forwarder/epd` и `/forwarder/goslog` (как табы внутри одного маршрута, чтобы не плодить страницы).
- В карточке перевозчика (`carriers.$carrierId.tsx`) — блок `CarrierEpdReadinessBlock` (read-only для диспетчера + кнопка ручной правки).

Тренажёр — отдельный flow `EpdTrainingBlock` с явным баннером «Учебный режим, документы не отправляются оператору».

### 5. Saby интеграция

`sabyPrepareDocument`:
1. Загружает doc → ищет `scenario_id`. Если нет — возвращает `{ ok:false, error:"scenario_required" }`.
2. Зовёт `validateScenario` → если есть `errors` — `{ ok:false, errors }`.
3. Иначе строит payload + дополнительный `meta.epd_context = { scenario_type, forwarder_possession_mode, ... }`.

`sabySendDocument` — блокируется тем же чеком; для `is_training=true` документов отправка явно запрещена.

### 6. Что НЕ делаем (явные ограничения)

- Реальной подписи КЭП/МЧД/Госключ нет.
- Live HTTP в Saby/1С/ГосЛог нет.
- QR — mock UID с пометкой «тестовый».
- Парсинг сайтов не делаем.
- Логины Госуслуг и закрытые ключи нигде не хранятся.
- Никаких VPS/nginx/PM2.

### 7. Проверка

`npx tsc --noEmit` в конце. Проверяю, что старые страницы (carrier.edo.$id, carrier.trips, forwarder, dispatcher) открываются и mock Saby не сломан.

### Технические детали

- Все серверные модули — через `resolveCarrierCtx` (user-client + RLS).
- `*.server.ts` импортируется только внутри API-роутов; UI ничего серверного не тянет.
- `process.env.*` — только внутри handler'ов.
- `carrier_my_ext_id()` RPC переиспользуем.
- Для forwarder/dispatcher API — новые helpers `resolveForwarderCtx`, `resolveDispatcherCtx` (минимальные, по аналогии).
- В новых таблицах — `update_updated_at_column` триггер.

### Объём

Примерно: 1 миграция, ~6 серверных модулей, ~15 API-роутов, ~13 UI-компонентов, изменения в 5-6 существующих файлах. Один пакет.

### На следующий этап остаётся

- Реальная live-интеграция Saby (HTTP, OAuth).
- Реальный 1С-коннектор.
- Реальная подпись КЭП/Госключ/МЧД.
- Реальный QR ГИС ЭПД.
- Live-проверка ГосЛог по официальному API.

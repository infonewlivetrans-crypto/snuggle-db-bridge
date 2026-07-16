
# План: запуск ATI из Радиус Трек + уведомление об обновлении + фикс URL

Объём большой (3 связанных подзадачи, много файлов расширения и UI). Разбиваю на 4 подэтапа. Прошу подтвердить план — далее иду сразу по всем этапам без остановок.

## Подэтап A. Единая константа ATI_LOADS_URL и фикс 404

Причина: сейчас везде используется `https://ati.su/loads/` — возвращает 404.

- Создать `browser-agent/src/ati/atiUrls.ts` с `ATI_LOADS_URL = "https://loads.ati.su/"` и helper `isAtiHost(hostname)` (принимает `ati.su` и `loads.ati.su`).
- Заменить все литералы `https://ati.su/loads/` и `chrome.tabs.query({ url: "https://ati.su/*" })` в:
  - `browser-agent/src/background.ts` (2 места создания вкладки, 2 места query, restore)
  - `browser-agent/src/popup.ts`
  - `src/server/ai-dispatcher/agent-adapter.server.ts` (2 места) и `candidates.$id.open-on-ati.ts`
  - `src/server/ai-dispatcher/mock-agent.server.ts`
  - `browser-agent/MANUAL_TEST_CHECKLIST.md`
- `browser-agent/manifest.json`: добавить `https://loads.ati.su/*` в `host_permissions` и в `content_scripts.matches` (сохранить обратную совместимость с `ati.su/*`).
- `managed-tab-rules.mjs` уже принимает `loads.ati.su` (регекс `(^|\.)ati\.su$`) — оставить.
- Тест `browser-agent/tests/ati-urls.test.mjs`: запретить старый адрес (grep-ом по исходникам + проверка константы).

## Подэтап B. Web ↔ Extension bridge: RT_OPEN_ATI_AND_START и прогресс

Расширить существующий `web-bridge.ts`, не создавая параллельный протокол.

Новые события (все проходят origin-фильтр в `agent-origins.ts` — только `radius-track.ru` и preview-домены Lovable):
- `RT_AGENT_PING` / `RT_AGENT_READY` (RT_AGENT_READY возвращает `{ installed:true, version }`).
- `RT_OPEN_ATI_AND_START` — payload `{ taskId }`. URL берётся только из константы, из payload не принимается.
- Ответные: `RT_ATI_OPENING`, `RT_ATI_LOGIN_REQUIRED`, `RT_ATI_READY`, `RT_SEARCH_STARTED`, `RT_SEARCH_PROGRESS`, `RT_SEARCH_COMPLETED`, `RT_SEARCH_FAILED`, `RT_SEARCH_STOPPED`.

Правила:
- Никогда не отправлять agent token / session / Supabase creds наружу.
- Строгая zod-подобная валидация формы сообщений.
- Клиент: `src/lib/ai-dispatcher/extension-bridge.ts` получает `openAtiAndStart(taskId)` и подписку `onOrchestratorEvent`.

## Подэтап C. Background: managed tab, авторизация, Full Scan loop

В `browser-agent/src/background.ts`:
- Обработчик `RT_OPEN_ATI_AND_START`:
  1. Проверить сохранённый `managedTabId` (уже в `state.ts`).
  2. Если вкладка есть и её URL проходит `isAtiHost` — переиспользовать; `chrome.tabs.update(id, { active:true })` + фокус окна.
  3. Иначе `chrome.tabs.create({ url: ATI_LOADS_URL, active:true })`, сохранить id.
  4. На `chrome.tabs.onRemoved` — очистить `managedTabId`.
  5. Дождаться `content ready` (уже есть механизм) и запросить `detectAuthState`.
  6. Если не залогинен — эмитить `RT_ATI_LOGIN_REQUIRED`, ждать существующий `login-detected` flow. taskId не создаём заново.
  7. После login — `apply_filters` → `RT_SHOW_OVERLAY` → `fullScan.startOrSyncFilters` → цикл `submitPage` до `completed`.
  8. Прогресс страниц → `RT_SEARCH_PROGRESS { pagesRead, matched }`.

Не открывать произвольные URL из сообщения. URL — только `ATI_LOADS_URL`.

## Подэтап D. UI: единая кнопка + уведомление об обновлении

`SimpleAgentPanel.tsx` (state machine расширяется):
- Одна главная кнопка с состояниями: «Установить агент» / «Подключить» / «Запустить поиск в ATI» / «Открываю ATI…» / «Войдите в ATI» / «Применяю фильтры…» / «Идёт поиск» / «Продолжить поиск» / «Поиск завершён».
- Подписка на события bridge для обновления состояния (в дополнение к существующему поллингу оркестратора).

Уведомление об обновлении:
- Новый файл `public/downloads/browser-agent/version.json` (см. ниже).
- Компонент `src/components/ai-dispatcher/AgentUpdateBanner.tsx` — жёлтая карточка сверху `SimpleAgentPanel`.
- Хук `src/hooks/use-agent-version-check.ts`: fetch `version.json?ts=Date.now()`, ping расширения, semver compare (мини-функция `compareSemver` в `src/lib/semver.ts` — корректно обрабатывает `0.2.9` vs `0.2.10`).
- Кнопки: «Скачать обновление» (только относительный URL или `radius-track.ru`), «Как обновить» (Dialog с инструкцией), «Позже» (localStorage `rt-agent-update-dismissed:<version>`).
- `required=true` — блокировать «Позже».
- Если расширения нет вовсе → показывать `InstallAgentCard`, а не баннер.
- «Проверить версию» — повторный ping без reload.
- Ошибка fetch version.json — тихо скрыть баннер, не ломать AI-диспетчер.
- Скрипт `browser-agent/scripts/package-extension.mjs` расширить: писать `version.json` рядом с существующим `latest.json`, поля из плана.

Тесты (Node --test):
- `browser-agent/tests/ati-urls.test.mjs` — запрещает старый URL, проверяет константу и manifest.
- `browser-agent/tests/web-bridge-origin.test.mjs` — принимает только radius-track.ru, отклоняет чужой origin, отклоняет произвольный URL в payload.
- `browser-agent/tests/managed-tab-open.test.mjs` — reuse существующей managed-вкладки, создание при отсутствии, cleanup при закрытии.
- `src/lib/semver.test.ts` (vitest) — сравнение 0.2.9 vs 0.2.10, равные, новее, невалидные.

## Подэтап E. Bump 0.2.5, typecheck, tests, package

- `browser-agent/package.json`, `manifest.json`, `browser-agent/src/version.ts`: 0.2.5.
- `bunx tsgo --noEmit` в корне и `tsc --noEmit` в `browser-agent/`.
- `node --test browser-agent/tests/*.test.mjs`.
- Сборка `radius-track-agent-0.2.5.zip` через существующий `scripts/package-extension.mjs`, публикация в `public/downloads/browser-agent/`.

## Что НЕ трогаю

- Миграции и БД.
- `mock-agent.server.ts` кроме одиночной замены URL на константу (без изменения логики).
- ЭДО, склад, маршруты и прочее.
- `src/integrations/supabase/*` (auto-gen).

## Технические детали

```text
Web (radius-track.ru)                Extension (background)
  ─ RT_AGENT_PING ────────────────▶  answer RT_AGENT_READY {version}
  ─ RT_OPEN_ATI_AND_START {taskId} ▶  managed tab logic ─► ATI_LOADS_URL
                                       │
  ◀── RT_ATI_OPENING ─────────────────┤
  ◀── RT_ATI_LOGIN_REQUIRED (если) ───┤ (ждём login-detected)
  ◀── RT_ATI_READY ───────────────────┤ (apply_filters)
  ◀── RT_SEARCH_STARTED ──────────────┤
  ◀── RT_SEARCH_PROGRESS × N ─────────┤ (fullScan loop)
  ◀── RT_SEARCH_COMPLETED / FAILED ───┘
```

`version.json` (единый источник):
```json
{
  "version": "0.2.5",
  "downloadUrl": "/downloads/browser-agent/radius-track-agent-0.2.5.zip",
  "required": false,
  "publishedAt": "2026-07-16",
  "changes": [
    "Запуск ATI непосредственно из Радиус Трек",
    "Автоматический полный поиск грузов",
    "Исправлен адрес поиска ATI (loads.ati.su)"
  ]
}
```

Подтвердите план — начинаю реализацию по всем подэтапам подряд без остановки.

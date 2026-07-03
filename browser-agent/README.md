# Radius Track Browser Agent — skeleton (dev)

Это dev-заготовка Chrome-расширения. **Не подключено к основному build.**

## Принципы
- Агент работает только на страницах, открытых пользователем.
- Не хранит логин и пароль ATI.
- **Не использует API ATI.**
- Не обходит защиту (капча, rate-limits и т.д.).
- Читает только видимую выдачу.
- Передаёт в Радиус Трек только видимые/выбранные данные для оценки груза.
- Диспетчер принимает решение сам: звонит и подтверждает груз вручную.

## Команды (Agent Protocol)
Агент polling'ом получает команды от Радиус Трек:
`open_ati`, `apply_filters`, `start_search`, `refresh_page`, `read_visible_loads`,
`focus_candidate`, `open_candidate_page`, `close_candidate_page`,
`close_irrelevant_tabs`, `pause_search`, `resume_search`, `stop_search`,
`heartbeat_check`.

## Структура
- `manifest.json` — MV3 manifest.
- `src/background.ts` — service worker: heartbeat + polling команд.
- `src/content.ts` — content script: чтение видимой выдачи со страницы ATI.
- `src/popup.tsx` — popup для pairing-кода и статуса.

## Подключение (следующий этап)
1. Диспетчер создаёт код подключения в `/dispatcher/ai-dispatcher`.
2. Вводит код в popup расширения.
3. Расширение сохраняет session_id + pairing token в локальном storage браузера.
4. Далее — heartbeat каждые 30 сек и polling команд.

На dev-этапе публичные endpoints агента (`/api/public/agent/ai-dispatcher/*`)
возвращают 501. Реальная авторизация будет реализована на следующем этапе.

## Установка dev-версии
1. Скомпилировать TS в `src/*.js` (или временно переименовать `src/background.ts` → `.js`) — MV3 сервис-воркер грузит именно JS.
2. `chrome://extensions` → включить **Developer mode** → **Load unpacked** → выбрать папку `browser-agent/`.
3. Открыть popup расширения.
4. Ввести **Base URL** Радиус Трек (preview или production URL Lovable-проекта).
5. Ввести **pairing code**, полученный из UI `/dispatcher/ai-dispatcher` (кнопка «Создать код подключения»).
6. Нажать «Подключить». Popup покажет статус и последний heartbeat.

## Как работает pairing (dev)
- Диспетчер создаёт agent session → сервер генерирует одноразовый pairing-код `RT-XXXX-XXXX` с TTL 15 минут.
- Popup отправляет код на `POST /api/public/agent/ai-dispatcher/pair`.
- Сервер возвращает `agent_token` (показывается один раз). Хеш токена (SHA-256) хранится в `ai_dispatch_agent_sessions.agent_token_hash`.
- Дальше все запросы агента идут с `Authorization: Bearer <agent_token>`.

## Поддержанные endpoints
- `POST /pair`, `POST /heartbeat`, `GET /commands/poll`,
- `POST /commands/:id/ack|complete|fail`,
- `POST /events`, `POST /tabs`, `POST /loads`.

## Тестирование mock loads
Кнопка «Отправить тестовые грузы» в popup отправляет 2 демо-груза в текущую `search_task_id`
(последняя, полученная из команды агенту).

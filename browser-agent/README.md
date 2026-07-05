# Radius Track Browser Agent (dev)

Chrome MV3 extension. **Работает только с открытой страницей ATI в браузере диспетчера.**

- Не использует API ATI.
- Не читает cookies, localStorage, пароли ATI.
- Не обходит капчу и защиту.
- Читает только видимую выдачу.
- Диспетчер сам звонит и подтверждает груз.

## Сборка

```bash
cd browser-agent
npm install
npm run build          # → dist/
npm run typecheck      # tsc --noEmit
npm test               # node --test
npm run package        # → packaged/radius-track-agent.zip (нужен `zip`)
```

Собирается через esbuild:

- `src/background.ts` → `dist/background.js`
- `src/content.ts` → `dist/content.js`
- `src/popup.ts` → `dist/popup.js`
- `manifest.json`, `popup.html` копируются в `dist/`.

## Установка в Chrome (dev)

1. `cd browser-agent && npm install && npm run build`
2. Открыть `chrome://extensions`.
3. Включить «Режим разработчика».
4. Нажать «Загрузить распакованное расширение».
5. Выбрать папку `browser-agent/dist`.
6. Открыть popup расширения.
7. Ввести dev URL Радиус Трек (например `https://your-project.lovable.app`), нажать «Проверить соединение».
8. В кабинете диспетчера `/dispatcher/ai-dispatcher` создать pairing-код (`RT-XXXX-XXXX`).
9. Ввести код в popup и нажать «Подключить».
10. Открыть `https://ati.su/loads/` и войти вручную.
11. Запустить поиск из Радиус Трек — агент откроет вкладку задачи, применит фильтры, прочитает видимую выдачу.
12. При проблемах — «Диагностика страницы» в popup (данные обезличены, без токенов).

## Что делать, если ATI изменил разметку

1. Открыть popup → «Диагностика страницы» → «Скопировать диагностику».
2. Прислать вывод в чат разработчика.
3. В `browser-agent/src/ati/atiSelectors.ts` и `formSelectors.ts` добавить/обновить стратегии.
4. Поднять `ATI_SELECTOR_CONFIG_VERSION`.
5. Пересобрать: `npm run build`.
6. В Chrome нажать «Обновить» на карточке расширения.

## Fixture для локальных тестов

`browser-agent/test-fixtures/ati-loads-page.html` — упрощённая страница с формой и 7 карточками грузов.
Открыть локально (например через `python3 -m http.server`) и проверить apply_filters / read / highlight / focus / «В звонки».
Fixture **не является копией настоящего сайта ATI**.

## Endpoints (public agent API)

`POST /pair`, `POST /heartbeat`, `GET /commands/poll`,
`POST /commands/:id/{ack|complete|fail}`,
`POST /events`, `POST /tabs`, `POST /loads`, `POST /call-queue/:candidate_id`.

Все, кроме `/pair`, требуют `Authorization: Bearer <agent_token>`.
Токен хранится в `chrome.storage.local`, только на устройстве диспетчера.

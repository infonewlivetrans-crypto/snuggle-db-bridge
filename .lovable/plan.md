
# Production Cleanup — Radius Track Agent 0.2.7

Это большой этап. Разобью его на подэтапы, чтобы каждый можно было проверить отдельно перед следующим. Ниже — план по всем 15 пунктам. Прошу подтвердить (или указать, что сдвинуть/упростить), прежде чем начну.

## Подэтап A. Shadow DOM и удаление legacy-панели (пункты 1, 2)

- Переписать `browser-agent/src/ati/agentOverlay.ts`:
  - один host `radius-track-agent-host`;
  - `attachShadow({mode:"open"})`;
  - отдельный `<style>` с `style.textContent = CSS` (никакого `innerHTML` для стилей);
  - отдельный UI root, весь рендер только внутрь него;
  - защита от дублей и от повреждённого host.
- В `content.ts` при инициализации удалить legacy id/классы:
  `rt-agent-overlay-host`, старые кнопки «Прочитать»/«Отправить», старый DOM.
- Убрать кнопки `read`/`send` из production overlay (оставить только статус + свернуть).
- Тесты: CSS не появляется как текст в `document.body`, host один, style + ui root существуют.

## Подэтап B. Разделение channel dev / stable (пункты 3, 4, 12)

- Добавить `CHANNEL` в `esbuild.config.mjs` через env (`stable` / `dev`).
- Production bundle:
  - `BASE_URL = https://radius-track.ru`;
  - вырезать mock-агент, ALLOW_MOCK_AGENT, dev popup, диагностику, ручной base URL, pairing code UI, кнопки «Прочитать/Отправить/Диагностика», build date;
  - build fail при обнаружении в bundle: `lovable.app`, `channel: dev`, `ALLOW_MOCK_AGENT`, `/mock-`, `mockOpenAti`, `mockRefreshTask`, «Прочитать», «Отправить», dev base URL.
- Упростить `popup.html`/`popup.ts` под production: имя, версия, подключён/нет, пользователь, ATI-статус, активный поиск, «Открыть Радиус Трек», «Открыть ATI».
- `package-extension.mjs` собирает и валидирует только stable-архив `radius-track-agent-0.2.7.zip`.

## Подэтап C. Удаление runtime mock (пункт 4)

- Удалить `src/server/ai-dispatcher/mock-agent.server.ts` и все runtime импорты.
- Удалить `mockRefreshTask`, `mockOpenAti`, `ALLOW_MOCK_AGENT`, mock fallback в UI.
- Fixtures оставить только в `browser-agent/test-fixtures/` и в тестовых файлах.
- Если агент не подключён — UI показывает «Агент не подключён», без mock-данных.

## Подэтап D. Чистка тестовых данных (пункт 5)

- Сначала прогнать SELECT (через `supabase--read_query`) и показать пользователю кол-во:
  - `ai_dispatch_search_tasks` с mock/test/пустыми направлениями;
  - `ai_dispatch_load_candidates` с `external_url LIKE '%/mock-%'` или `external_id LIKE 'mock-%'`.
- Миграция + insert-скрипт: удалить mock-кандидатов; задачи с пустым направлением «— → —» → архив (`archived_at`, скрыть из UI), реальные не трогать.
- В UI фильтровать по `archived_at IS NULL` + скрывать пустые направления.
- Отдельная кнопка «Показать архив».

## Подэтап E. Цель ₽/км в автомобиле (пункт 6)

- Миграция: `vehicles.target_rub_per_km numeric` (уже есть `min_rub_per_km`?) — проверить и добавить, если нет.
- В форме автомобиля: поля «Мин. ₽/км» и «Целевая ставка, ₽/км», разные подписи.
- При выборе авто в поиске — автоподстановка `target_rub_per_km`.
- «Разовое переопределение» только в текущей задаче, без записи в `vehicles`.
- Убрать отдельный блок цели, если он дублируется.
- Если цель не заполнена — модалка «Указать и сохранить в карточке?».

## Подэтап F. Первичная привязка ATI (пункты 7, 8, 9, 13)

- Проверить существующие таблицы: `ai_dispatch_agent_sessions`, `dispatcher_carrier_*`.
  Скорее всего расширим `ai_dispatch_agent_sessions` полями `ati_account_code`, `ati_display_name`, `linked_at`, `status`. Новую таблицу создам только если существующая не подходит.
- Content script: детектор ATI-аккаунта (имя + код 2809104) через DOM после логина.
- Bridge command `RT_ATI_BIND_REQUEST`: открыть/сфокусировать `loads.ati.su`, дождаться логина, вернуть `{code, name}`.
- Onboarding UI (`/dispatcher/ai-dispatcher`): 3 шага — установить агент → подключить ATI → подтвердить `код + имя`.
- Одноразовый confirm-токен (RPC, SECURITY DEFINER, фиксированный `search_path`).
- Никакого сохранения логина/пароля/cookies/localStorage ATI.
- Кнопки «Открыть ATI», «Проверить подключение», «Перепривязать ATI», «Отключить ATI».
- При повторном входе binding уже есть — onboarding пропускается. Если ATI-код изменился — стоп + перепривязка.
- Admin-view: `who / code / name / last_seen` (без секретов).

## Подэтап G. Понятные статусы (пункт 11)

- Маппинг orchestrator-стадий → человеческие строки в `src/lib/ai-dispatcher/status-labels.ts`.
- `SimpleAgentPanel` / `SearchProgressBlock` показывают только маппед-строки.
- `task_id`/`command_id` — только в dev/diagnostics.
- Пустые задачи скрыты.

## Подэтап H. Запуск поиска (пункт 10)

- Кнопка «Найти груз»: цепочка проверок агент → binding → managed-tab → auth → filters(target) → search.
- Кандидаты без реального `loadinfo`: кнопка disabled + «Ссылка ATI не получена». Fallback на главную ATI убрать.

## Подэтап I. Тесты, typecheck, релиз (пункты 14, 15)

- Все проверки из пункта 14 как unit-тесты (browser-agent) + Playwright для критических UI-флоу.
- Скрипт валидации ZIP: `grep`-поиск запрещённых строк, exit 1 при найденном.
- Bump до `0.2.7`, `version.json`, собрать stable-zip.
- Typecheck (`tsgo`) + полный test-run.
- Финальный отчёт: удалённый runtime, кол-во mock-записей, схема binding, миграции, файлы, результаты, ссылка на 0.2.7.

## Технические заметки

- Не трогаю `src/integrations/supabase/*.ts` (auto-gen).
- Миграции применяю через `supabase--migration`, данные через `supabase--insert` (после подтверждения количеств).
- Deploy на `radius-track.ru`: у меня нет прямого доступа к production-домену — публикация выполняется через кнопку «Publish» в Lovable, а на кастомный домен — через настройки проекта. Я подготовлю сборку и открою publish, но нажать «Update» и подтвердить домен нужно вам.

## Порядок работ и проверок

Предлагаю идти по подэтапам A → B → C → D → E → F → G → H → I, останавливаясь после каждого для короткой проверки в preview. Если хотите — могу сразу склеить A+B+C (technical cleanup) и потом D+E+F (data + UX) двумя большими блоками. Скажите, какой ритм удобнее.

## Что уточнить перед стартом

1. **Ритм**: подэтап-за-подэтапом (безопаснее) или два больших блока (быстрее)?
2. **Домен** `radius-track.ru` — уже привязан к проекту в Lovable, или его нужно подключить?
3. **ATI-код 2809104** и «Мезенцев С.Э.» — это тестовые данные для примера, или это реальный первый пользователь, который сейчас сидит в проде? От этого зависит, насколько агрессивно чистить существующие записи.
4. **Legacy данные**: удалить mock-кандидаты hard-delete или soft-archive?

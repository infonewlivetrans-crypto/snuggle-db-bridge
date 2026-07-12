# Checkpoint B — фаза 2: миграция БД и серверный слой full-scan

Продолжение Checkpoint B после чистого ядра модулей. На этой фазе — только БД и сервер; DOM/расширение и UI варианта диспетчера идут отдельными фазами.

## 1. Миграция БД

Новая миграция `supabase/migrations/<ts>_ai_dispatch_full_scan.sql`:

**`ai_dispatch_search_tasks`** — добавить:
- `filter_fingerprint text` — хэш активных фильтров (из `filter-fingerprint.mjs`)
- `initial_scan_status text` (`pending|running|done|reset`) default `pending`
- `initial_scan_started_at timestamptz`, `initial_scan_completed_at timestamptz`
- `initial_scan_pages_read int` default 0
- `initial_scan_error text`
- `last_seen_page_fingerprint text`
- `pagination_max_pages int` default 500

Индекс: `(user_id, filter_fingerprint)`.

При `apply_filters` сервер сверяет новый fingerprint со старым — при изменении сбрасывает `initial_scan_status='reset'` и обнуляет счётчики.

**`ai_dispatch_load_candidates`** — добавить:
- `rejection_reason text` (`weight|volume|body|loading|payment|rating|window|route|manual|...`)
- `rejection_details jsonb`
- `first_seen_page int`, `last_seen_page int`
- `rating_negative boolean` default false
- `rating_reasons jsonb`

GRANT/RLS — как у существующих полей; в этих же таблицах RLS уже есть, только `GRANT SELECT/UPDATE` на новые колонки не требуется (grants — на таблицу).

## 2. Серверные модули

**`src/server/ai-dispatcher/full-scan.server.ts`** (новый):
- `beginInitialScan(taskId, filterFingerprint)` — атомарно ставит `running`, сбрасывает при смене fingerprint.
- `recordScanPage(taskId, pageFingerprint, pageIndex, loads[])` — использует `pagination-guard` (импорт из `shared/`) для детекта loop / max_pages; возвращает `{ok, reason, pagesRead}`.
- `completeInitialScan(taskId, reason)` — `done` или `reset`.
- `markCandidateRejected(candidateId, reason, details)`.

**`src/server/ai-dispatcher/filter-sync.server.ts`** (новый):
- Обёртка над apply_filters команды: считает fingerprint, вызывает `beginInitialScan` если изменился.

**`src/routes/api/public/agent.ai-dispatcher.$.ts`** — новые пути (только с agent-токеном):
- `POST /full-scan/page` — приём страницы (page fingerprint + loads[]); возвращает `{continue, reason}`.
- `POST /full-scan/complete` — финализация.
- `GET /full-scan/status` — для UI (сколько страниц прочитано, статус).

Идемпотентность: каждая запись включает `orchestration_run_id` и `page_index`; повторный вызов с той же парой — no-op.

## 3. RPC (SECURITY DEFINER)

Одна функция, чтобы избежать гонок при apply_filters:
```sql
create or replace function public.agent_reset_initial_scan_if_filters_changed(
  _task_id uuid, _fingerprint text
) returns jsonb ...
```
Возвращает `{reset: bool, previous_fingerprint, new_fingerprint}`. GRANT `EXECUTE` для `authenticated` и `anon` (агент вызывает через public route с токеном; сам токен проверяется в route до RPC).

## 4. Тесты

`browser-agent/tests/` — уже покрыто (pagination-guard, filter-fingerprint).

Серверных unit-тестов у проекта нет — валидируем через `bunx tsgo --noEmit` и `supabase--linter` после миграции.

## 5. Вне scope этой фазы

- Никаких изменений в `content.ts`/`background.ts` расширения (следующая фаза).
- Никакого UI диспетчера для просмотра вариантов (фаза C).
- Bump версии агента — только после того, как поменяется его `dist/`.

## Технические заметки

- Миграция включает `GRANT` на новые таблицы не нужны — таблицы уже существуют, добавляются только колонки.
- Все server-модули — `.server.ts`, импортируются только из `.functions.ts` или route файлов.
- Использовать существующий helper авторизации агент-токена из `agent-auth.server.ts`.

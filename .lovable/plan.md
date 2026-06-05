# Этап 2 — CRUD Перевозчики / Водители / Транспорт (AI-диспетчер) — v3

## Изменения относительно v2

1. Миграция безопасна для существующих строк: новые «обязательные» поля добавляются как nullable; обязательность гарантируется Zod-валидацией на API.
2. В `dispatcher_vehicle_ext` добавляется `ready_date date` для фильтра «Готовы сегодня» и сортировки.
3. Статус `archive` добавлен в водителей и транспорт (DELETE = soft-delete во всех трёх сущностях).

Остальная архитектура из v2 не меняется.

---

## 1. Миграция — безопасный ALTER `dispatcher_*_ext`

Все новые колонки добавляются **nullable**. Существующие строки не ломаются. Обязательность для новых записей проверяет Zod в `/api/dispatcher/*` POST/PATCH.

### `dispatcher_carrier_ext`
```
ADD COLUMN name              text          -- название/ФИО  (Zod: required)
ADD COLUMN carrier_kind      text          -- ИП/ООО/самозанятый/физлицо (Zod: required, enum)
ADD COLUMN inn               text
ADD COLUMN ogrn              text
ADD COLUMN phone             text
ADD COLUMN email             text
ADD COLUMN city              text
ADD COLUMN whatsapp          text
ADD COLUMN telegram          text
ADD COLUMN max_messenger     text
ADD COLUMN bank_name         text
ADD COLUMN bank_account      text
ADD COLUMN bank_bik          text
ADD COLUMN bank_corr_account text
ADD COLUMN commission_rate   numeric NOT NULL DEFAULT 0.05
ADD COLUMN production_carrier_id uuid     -- опциональная ссылка, без FK
ALTER COLUMN carrier_id DROP NOT NULL     -- старая жёсткая 1:1 убирается
```

### `dispatcher_driver_ext`
```
ADD COLUMN full_name        text           -- ФИО (Zod: required)
ADD COLUMN phone            text
ADD COLUMN email            text
ADD COLUMN whatsapp         text
ADD COLUMN telegram         text
ADD COLUMN max_messenger    text
ADD COLUMN dispatcher_carrier_ext_id uuid
ADD COLUMN docs_verified    boolean NOT NULL DEFAULT false
ADD COLUMN production_driver_id uuid
ALTER COLUMN driver_id DROP NOT NULL
```

### `dispatcher_vehicle_ext`
```
-- технические поля
ADD COLUMN vehicle_kind     text
ADD COLUMN body_type        text
ADD COLUMN payload_kg       numeric
ADD COLUMN volume_m3        numeric
ADD COLUMN length_m         numeric
ADD COLUMN width_m          numeric
ADD COLUMN height_m         numeric
ADD COLUMN load_methods     text[]        -- back / side / top / tail_lift
ADD COLUMN home_city        text
ADD COLUMN ready_to_cities  text[]
ADD COLUMN ready_date       date          -- ← НОВОЕ (для фильтра «Готовы сегодня»)

-- связи
ADD COLUMN dispatcher_driver_ext_id  uuid
ADD COLUMN dispatcher_carrier_ext_id uuid
ADD COLUMN production_vehicle_id     uuid

-- ставки (экономика рейса)
ADD COLUMN minimum_trip_rate numeric
ADD COLUMN minimum_km_rate   numeric
ADD COLUMN city_rate         numeric
ADD COLUMN point_rate        numeric
ADD COLUMN rate_comment      text

ALTER COLUMN vehicle_id DROP NOT NULL
```

### Безопасность миграции
- Все `ADD COLUMN` — nullable (кроме `commission_rate`/`docs_verified` с дефолтами — безопасны для существующих строк).
- `DROP NOT NULL` существующих колонок безопасен.
- Нет `UPDATE` существующих строк, нет backfill.
- RLS, GRANT-ы, политики уже есть из Этапа 1 — не трогаем.
- На production-таблицах никаких операций.

---

## 2. Статусы (валидируем Zod на сервере)

- **carrier**: `new | on_check | ready_to_work | missing_docs | blocked | archive`
- **driver**: `new | docs_unchecked | ready_to_work | free | on_trip | resting | inactive | blocked | archive`
- **vehicle**: `new | docs_unchecked | available | waiting_freight | offered | on_trip | unloading | resting | inactive | blocked | archive`

Дефолты в БД: `dispatcher_carrier_ext.verification_status='new'`, `dispatcher_driver_ext.dispatcher_status='free'`, `dispatcher_vehicle_ext.dispatcher_status='available'` (уже стоят, не меняем).

`DELETE /api/dispatcher/{entity}/$id` → soft-delete → `status='archive'`. Никаких реальных `DELETE` к строкам.

---

## 3. API endpoints

Все под `/api/dispatcher/*`, `requireAnyRole(["admin","dispatcher"])`, user-client с RLS. Zod-валидация входа.

```
GET    /api/dispatcher/carriers              ?limit&offset&search&status&city
POST   /api/dispatcher/carriers
GET    /api/dispatcher/carriers/$id
PATCH  /api/dispatcher/carriers/$id
DELETE /api/dispatcher/carriers/$id          → status='archive'

GET    /api/dispatcher/drivers               ?limit&offset&search&status&city&carrier_id
POST   /api/dispatcher/drivers
GET    /api/dispatcher/drivers/$id
PATCH  /api/dispatcher/drivers/$id
DELETE /api/dispatcher/drivers/$id           → status='archive'

GET    /api/dispatcher/vehicles              ?limit&offset&search&status&city
                                             &body_type&carrier_id&driver_id&ready_today
                                             &sort=km_rate|trip_rate|ready_date|city
                                             &order=asc|desc
POST   /api/dispatcher/vehicles
GET    /api/dispatcher/vehicles/$id
PATCH  /api/dispatcher/vehicles/$id
DELETE /api/dispatcher/vehicles/$id          → status='archive'
```

Фильтр `ready_today=true` → `ready_date <= today AND status IN ('available','waiting_freight')`.

---

## 4. UI

```
/dispatcher/carriers
/dispatcher/drivers
/dispatcher/vehicles
```

Каждая страница:
- Заголовок + кнопка «Добавить» (Sheet с формой).
- Панель фильтров: статус, город, поиск (телефон/ФИО/название).
- Preset-чипы: «Все», «Готовы к работе», «Свободные», «Архив».
- Таблица + статус-бейдж + действия (карточка / редактировать / dropdown смены статуса).
- Карточка просмотра (Sheet): все поля + кликабельные контакты (`tel:`, `wa.me`, `t.me`, `max.ru/...`).

### Дополнительно `/dispatcher/vehicles`
- Колонки: тип кузова, грузоподъёмность, город, «готов с» (`ready_date`), мин. ставка/рейс, мин. ставка/км, статус.
- Сортировка: `minimum_km_rate`, `minimum_trip_rate`, `home_city`, `ready_date`, `dispatcher_status`.
- Preset-фильтры: «Свободны», «Ждут груз», «Готовы сегодня».
- Форма редактирования: 5 полей ставок + `rate_comment` + `ready_date`.

---

## 5. Технические детали

- `react-hook-form` + `zod` (уже в зависимостях).
- React Query: `useQuery`/`useMutation` + invalidate ключей `["dispatcher","carriers"|"drivers"|"vehicles",filters]`.
- Max Messenger: текст; рендер ссылки — если начинается с `http` → как есть, иначе `https://max.ru/{value}`.
- Контакт-ссылки в `src/lib/dispatcher/contacts.ts` (нормализация телефона, `wa.me`, `t.me`, `max.ru`).
- `production_*_id` — обычная uuid-колонка без FK, в UI Этапа 2 не выбирается (UI-выбор production-сущности придёт в Этапе 3 при создании сделки).
- Компоненты shadcn уже есть: Table, Sheet, Select, Input, Textarea, Badge, Tabs, DropdownMenu. Новых npm-зависимостей не добавляем.

---

## 6. Структура файлов

```
supabase/migrations/<timestamp>_dispatcher_ext_standalone.sql

src/routes/api/dispatcher/
   carriers.ts          GET / POST
   carriers.$id.ts      GET / PATCH / DELETE (soft)
   drivers.ts
   drivers.$id.ts
   vehicles.ts
   vehicles.$id.ts

src/routes/
   dispatcher.carriers.tsx       переписать с placeholder
   dispatcher.drivers.tsx        переписать
   dispatcher.vehicles.tsx       переписать

src/components/dispatcher/
   ContactLinks.tsx
   StatusBadge.tsx
   CarrierForm.tsx
   DriverForm.tsx
   VehicleForm.tsx
   EntityTableLayout.tsx

src/lib/dispatcher/
   contacts.ts          утилиты tel:/wa.me/t.me/max.ru
   statuses.ts          словари + цвета
   schemas.ts           zod-схемы (общие client + server)
   api.ts               typed-обёртки apiGet/apiPost/apiPatch/apiDelete
```

---

## 7. Что НЕ трогается

- production-таблицы `carriers`, `drivers`, `vehicles`, `orders`, `routes`, `route_points`, `delivery_routes` — никаких INSERT/UPDATE/DELETE/TRIGGER/ALTER
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`
- `/api/orders/*`, `/api/routes/*`, `/api/drivers` (старый), storage proxy, водительский контур
- RPC `admin_delete_order`, `driver_update_order_payment` и другие прошлые фиксы
- nginx, PM2, DNS, vite.config, package.json (никаких новых deps)
- `env-bootstrap`, `src/start.ts` (Этап 1)
- `dispatcher_freights`, `dispatcher_deals`, `dispatcher_tasks` — Этап 3
- `styles.css` — side-effect импорт

---

## 8. Проверка вручную

1. До миграции и после: `SELECT count(*) FROM carriers` / `drivers` / `vehicles` — числа идентичны.
2. `/dispatcher/carriers` → создать ИП с Telegram + Max → таблица содержит запись → клик по Telegram открывает `t.me/...`.
3. Смена статуса «новый» → «готов к работе» → бейдж обновился.
4. Удаление → запись пропала из «активных», вкладка «Архив» её показывает; БД — статус `archive`.
5. `/dispatcher/drivers` → создать водителя с привязкой к перевозчику AI-диспетчера → фильтр по перевозчику работает.
6. `/dispatcher/vehicles` → машина: тент, 5 т, мин. ставка 60 ₽/км и 30 000 ₽/рейс, Москва, `ready_date = today` → фильтр «Готовы сегодня» оставляет строку → сортировка «по ставке за км» меняет порядок.
7. Carrier/driver/manager под обычной учёткой → `/dispatcher/*` отдаёт 403.
8. Network: только `/api/dispatcher/*`, никаких прямых обращений к Supabase REST из браузера.
9. Режим `radius_track`: меню AI-диспетчера скрыто, прямой URL admin-у доступен (Этап 1, как и задумано).

---

## 9. Объём правок

- 1 миграция: только `ADD COLUMN` (nullable) и `DROP NOT NULL` в трёх `dispatcher_*_ext`.
- 6 API роутов.
- 3 страницы (переписать с placeholder).
- 5 переиспользуемых компонентов.
- 4 утилитарных модуля.
- 0 изменений в production-таблицах, 0 в client.ts/client.server.ts, 0 новых npm-зависимостей.

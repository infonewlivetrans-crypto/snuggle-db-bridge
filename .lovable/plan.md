ns
# План: упрощённый режим «AI-диспетчер» поверх Радиус Трек

Цель — добавить отдельный режим работы платформы для подбора грузов, не ломая текущий production: новые таблицы, новые серверные API под `/api/dispatcher/*`, новые маршруты UI под `/dispatcher/*`, переключатель режима в `system_settings`. Старые разделы только скрываются меню-фильтром, ничего не удаляется.

Объём большой. Делаю **в 4 этапа**, каждый — отдельным сообщением и проверяемой поставкой. Сейчас прошу подтвердить план целиком и согласие на этап 1.

---

## Архитектурные правила (соблюдаются на всех этапах)

- Новые таблицы — отдельным namespace `dispatcher_*`. Существующие production-таблицы (`orders`, `routes`, `delivery_routes`, `carriers`, `drivers`, `vehicles`, `route_points`, ...) **не трогаем**.
   - Исключение: `carriers/drivers/vehicles` уже есть и подходят — используем их **только на чтение** из dispatcher; всё новое (статус для диспетчера, согласие на комиссию, минимальная ставка под режим и т.п.) — в `dispatcher_*_ext` таблицах со связью `1:1` по id. Так старый продукт не ломается.
- Все привилегированные операции — через `SECURITY DEFINER` RPC + проверка роли через `has_role()`. Никакого `makeAdminClient()` в новых API.
- Фронт ходит **только** через `apiGet/apiPost/apiPatch/apiDelete` в `/api/dispatcher/*`. Никакого прямого Supabase из браузера.
- AI вызывается **только** из `/api/dispatcher/ai-analyze-freight` через Lovable AI Gateway (`LOVABLE_API_KEY`), модель `google/gemini-2.5-flash`.
- Новая роль `dispatcher` добавляется в `app_role` enum + `user_roles`. `admin` видит всё. `carrier/driver` — без изменений.
- Режим хранится в `system_settings` ключом `app.mode` со значениями `"radius_track"` (по умолчанию) или `"ai_dispatcher"`. Меняется в `/admin/settings` (есть). Меню в режиме `ai_dispatcher` показывает только dispatcher-разделы; в обычном — как сейчас.

---

## Этап 1 — Фундамент (миграции + режим + меню + пустые страницы)

**Миграции (одной транзакцией):**
- `ALTER TYPE app_role ADD VALUE 'dispatcher'` (если ещё нет).
- `dispatcher_carrier_ext(carrier_id pk fk carriers, payment_method text, commission_agreed boolean default false, verification_status text default 'new', dispatcher_comment text, timestamps)`.
- `dispatcher_driver_ext(driver_id pk fk drivers, city text, dispatcher_status text default 'free', dispatcher_comment text, timestamps)` — статус `free|on_trip|inactive`.
- `dispatcher_vehicle_ext(vehicle_id pk fk vehicles, ready_city text, ready_date date, min_rate numeric, dispatcher_status text default 'available', dispatcher_comment text, timestamps)`.
- `dispatcher_freights(id, from_city, to_city, load_date, unload_date, weight_kg, volume_m3, body_type, loading_method, rate numeric, source text, contact text, payment_term text, is_addon bool, status text, comment, created_by uuid, timestamps)`.
- `dispatcher_deals(id, carrier_id, driver_id, vehicle_id, main_freight_id fk dispatcher_freights, addon_freight_ids uuid[], total_rate numeric, commission_rate numeric default 0.05, commission_amount numeric generated always as (total_rate*commission_rate) stored, payment_due date, deal_status text, commission_status text, comment, timestamps)`.
- `dispatcher_tasks(id, type text, carrier_id, driver_id, vehicle_id, freight_id, deal_id, due_date, status text, priority text, comment, created_by, timestamps)`.
- RLS: все `dispatcher_*` доступны только `admin` и `dispatcher` (через `has_role`). Полные GRANT для `authenticated` + `service_role`.
- SECURITY DEFINER RPC: `dispatcher_upsert_freight`, `dispatcher_upsert_deal`, `dispatcher_complete_task`, и т.д. (вызываются API-ручками).

**Системная настройка:**
- Дефолт `app.mode = "radius_track"`. Тогглер уже работает через существующий `system_settings` UI; добавлю явный селектор в `admin.settings.tsx` без слома существующих опций.

**Меню/навигация:**
- Новый утиль `src/lib/app-mode.ts` (`useAppMode()`, читает из `SettingsProvider`).
- В рендерере основного меню: если `app.mode === "ai_dispatcher"`, показываем **только** dispatcher-пункты + базовые служебные (Настройки, Выход, Уведомления, Профиль). Старая логика модулей/launch-mode сохраняется как есть; AI-mode — внешний фильтр поверх.

**Маршруты-заглушки (создаём пустые страницы, чтобы fileTree встал):**
- `/dispatcher` (dashboard со списком задач на сегодня)
- `/dispatcher/carriers`, `/dispatcher/drivers`, `/dispatcher/vehicles`
- `/dispatcher/freights`, `/dispatcher/deals`, `/dispatcher/commissions`
- `/dispatcher/tasks`, `/dispatcher/ai-analyze`
- Каждая защищена `has_role(admin|dispatcher)` на уровне API; на UI — гейт через `useUserRoles()`.

**API-каркас (заглушки, возвращают пустые списки):**
- `src/routes/api/dispatcher/carriers.ts`, `drivers.ts`, `vehicles.ts`, `freights.ts`, `freights.$id.ts`, `deals.ts`, `deals.$id.ts`, `commissions.ts`, `tasks.ts`, `tasks.$id.ts`, `ai-analyze-freight.ts`.
- Все используют `requireCookieAuth` + проверку роли. Никакого admin client.

После этапа 1 уже можно: переключить режим в админке, увидеть новое меню, открыть все страницы (пустые), убедиться что старый продукт работает.

---

## Этап 2 — CRUD: Перевозчики, Водители, Транспорт

- Полные list/create/update/delete API через серверный RPC (читаем `carriers/drivers/vehicles` + `dispatcher_*_ext` join).
- UI с таблицами, фильтрами, карточками, диалогами добавления/редактирования (на `shadcn`).
- Привязка водитель↔перевозчик, транспорт↔водитель/перевозчик.

## Этап 3 — Грузы, Сделки, Комиссии, Задачи

- CRUD грузов (ручное добавление).
- Сделки с авто-комиссией 5% (generated column).
- Комиссии — отдельный view-список с фильтрами по статусу и просрочке, кнопка «напомнить» создаёт задачу.
- Задачи на сегодня — список + быстрые действия из карточек.

## Этап 4 — ИИ-анализ груза

- `POST /api/dispatcher/ai-analyze-freight` — вход `{ text }`, выход — структура полей + confidence + risks.
- Используем Lovable AI Gateway, `google/gemini-2.5-flash`, structured output через JSON schema (поля из ТЗ).
- На сервере же подбираем подходящий транспорт из `dispatcher_vehicle_ext` (фильтры по городу, типу кузова, грузоподъёмности, дате, статусу) и возвращаем список с причинами/рисками + сумма комиссии 5%.
- UI: textarea → «Разобрать» → preview-форма с подсветкой полей низкой уверенности → подтверждение → создание `dispatcher_freight` через существующий API.
- AI ничего не создаёт автоматически.

---

## Что НЕ меняется

- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts`, `.env`, `supabase/config.toml` (кроме автогена).
- Текущие маршруты `/api/orders/*`, `/api/routes/*`, водительский контур, storage proxy, offline queue, RPC `admin_delete_order`, `driver_update_order_payment` и т.п.
- Все существующие production-фиксы.

## Технические заметки

- Новая роль в enum — миграция отдельным statement (нельзя в одной транзакции с использованием значения, поэтому делю на две миграции: 1) добавить значение enum, 2) всё остальное).
- `commission_amount` — generated stored column, чтобы фронт никогда не считал сам.
- Для AI: секрет уже есть (`LOVABLE_API_KEY` в Cloud), отдельный запрос секрета не нужен.

---

## Подтверждение

Если план ок — начинаю с **Этапа 1** (миграции + режим + меню + страницы-заглушки + API-каркас). Этапы 2–4 — следующими сообщениями, чтобы каждый можно было ревьюить отдельно.

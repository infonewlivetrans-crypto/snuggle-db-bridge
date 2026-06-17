# Этап MVP: Онбординг перевозчика → появление машины на карте

## Цель
После регистрации перевозчик проходит понятный пошаговый мастер. Машина появляется на `/dispatcher/map` только когда минимально заполнены: перевозчик, документы, водитель, транспорт, привязка, местоположение, готовность.

## Архитектура (что меняем)

### 1. Миграция БД (идемпотентная, `ADD COLUMN IF NOT EXISTS`)

`dispatcher_carrier_ext`:
- `ati_code text`, `ati_email text`
- `taxation_type text` (ОСНО_НДС / УСН / ИП_БЕЗ_НДС / самозанятый / по_договорённости)
- `bank_name text`, `bik text`, `settlement_account text`, `correspondent_account text`
- `legal_address text`
- `onboarding_step text`, `onboarding_completed_at timestamptz`, `onboarding_progress jsonb`

`dispatcher_driver_ext`:
- `user_id uuid` (для приглашённого водителя), `city text`
- `whatsapp text`, `telegram text`, `max_messenger text`
- `license_categories text[]`, `license_number text`, `experience_years numeric`
- `has_dopog boolean`, `has_med_book boolean`, `permissions text[]`
- `docs_status text`, `docs_comment text`, `onboarding_completed_at timestamptz`

`dispatcher_vehicle_ext`:
- `assigned_driver_ext_id uuid` (НЕ unique — один водитель на несколько машин)
- `current_city text`, `current_lat numeric`, `current_lng numeric`
- `ready_date date`, `ready_from text`, `ready_to_cities text[]`
- `load_methods text[]`, `body_features text[]`
- `docs_status text`, `docs_comment text`, `onboarding_completed_at timestamptz`

Снять unique-ограничение с `assigned_driver_ext_id`, если оно есть (DROP CONSTRAINT IF EXISTS).

### 2. Новый серверный endpoint
`GET /api/carrier/onboarding-status` → возвращает:
```
{ carrierComplete, documentsComplete, hasDriver, driverComplete,
  driverDocumentsComplete, hasVehicle, vehicleComplete,
  vehicleDocumentsComplete, hasVehicleDriverBinding, hasLocation,
  canAppearOnMap, missing: string[], nextStep: string }
```
Вычисляется на сервере по реальным таблицам. Применяется и к новым, и к существующим перевозчикам.

### 3. Гейтинг карты
В существующей серверной выдаче free vehicles (`/api/dispatcher/vehicles` / `dispatcher_vehicle_ext` запросы) добавить фильтр: машина показывается только если выполнены условия `canAppearOnMap`. Можно реализовать через SQL view `v_dispatcher_map_vehicles` или через WHERE в существующем handler.

Перевозчик в своём кабинете видит «недозаполненную» машину со статусом «Не участвует в подборе».

### 4. Фронт

Новый маршрут `src/routes/carrier.onboarding.tsx` — пошаговый мастер из 9 шагов:
1. Компания (название, тип, ИНН, ОГРН, город, контакт)
2. Контакты и ATI (телефон, email, whatsapp, telegram, max, ati_code, ati_email)
3. Налоговый режим и реквизиты
4. Документы компании (использовать `CarrierDocumentsBlock`)
5. Водитель (выбор: «я сам водитель» / «наёмный» / «позже»)
6. Документы водителя
7. Транспорт (форма с тоннами, кузов, размеры, виды загрузки, особенности)
8. Документы транспорта + фото
9. Готовность: закрепить водителя, текущий город/координаты, ready_date, ready_from, ready_to_cities → «Машина появится на карте»

Каждый шаг автосохраняется. Прогресс пишется в `onboarding_progress jsonb`. При повторном входе — продолжение с `onboarding_step`.

Чек-лист сверху на `/carrier` (новый компонент `OnboardingChecklist`) с кнопкой «Продолжить настройку → /carrier/onboarding». Скрывается, когда `canAppearOnMap === true`.

Приглашение водителя:
- Кнопка «Пригласить водителя» в `/carrier/drivers` → создание токена в `carrier_invites` (используем существующую таблицу) с типом driver.
- Публичная страница `/driver/invite/$token` — водитель регистрируется (телефон+пароль через supabase.auth), привязывается к `dispatcher_driver_ext.user_id` и `carrier_id`.

Множественная привязка: в форме редактирования транспорта `assigned_driver_ext_id` — простой `<Select>` из всех водителей перевозчика, без проверки «уже занят».

В карточке водителя (`carrier.drivers.tsx`) — список всех его машин (запрос по `assigned_driver_ext_id`).

### 5. Список изменяемых файлов

Новые:
- `supabase/migrations/<ts>_onboarding_fields.sql`
- `src/routes/carrier.onboarding.tsx`
- `src/routes/api/carrier/onboarding-status.ts`
- `src/routes/driver.invite.$token.tsx`
- `src/routes/api/carrier/driver-invite.ts` (создание токена)
- `src/routes/api/public/driver-invite-accept.ts`
- `src/components/carrier/OnboardingChecklist.tsx`
- `src/components/carrier/onboarding/Step*.tsx` (9 шагов)
- `src/lib/carrier/onboarding.ts` (общая логика статуса/типов)

Изменяемые:
- `src/routes/carrier.tsx` — добавить `OnboardingChecklist` сверху
- `src/routes/carrier.drivers.tsx` — кнопка «Пригласить», список машин водителя
- `src/routes/carrier.vehicles.tsx` / `CarrierVehicleForm.tsx` — поле «Водитель» без unique-проверки, поля готовности
- `src/components/dispatcher/FreeVehiclesBlock.tsx` / соответствующий API — фильтр `canAppearOnMap`
- `src/integrations/supabase/types.ts` — авто после миграции
- `.lovable/plan.md` — обновить

### 6. Что НЕ трогаем
ATI-парсер, AI-поиск, сделки, почта, звонки, акты, счета, nginx/PM2/DNS, storage proxy, старые orders/routes, `SUPABASE_SERVICE_ROLE_KEY`, `auth.admin`, `client.server.ts` админ-операции вне приглашений.

### 7. Production-проверка
1. Новый перевозчик → `/carrier/register` → `/carrier` → видит чек-лист → `/carrier/onboarding` → шаги 1-9 → машина появляется в `/dispatcher/map`.
2. Перезайти посреди шага 5 → продолжается с шага 5.
3. Старый перевозчик без данных видит чек-лист.
4. Приглашение водителя по ссылке: водитель регистрируется и появляется в `/carrier/drivers`.
5. Один водитель закреплён за 2 машинами — обе сохраняются.
6. До завершения настройки машина НЕ видна на карте диспетчера.
7. Грузоподъёмность в тоннах. Фото с iPhone/Android работают.
8. `tsc --noEmit` и `npm run build` зелёные.

## Объём
Этап большой (~15-20 файлов, 1 миграция, новый wizard UI). Реализую за один проход с параллельными правками, без рефакторинга существующих рабочих частей.

## Вопрос перед стартом
Подтвердите: создаём отдельный маршрут `/carrier/onboarding` (рекомендую) + чек-лист на `/carrier`. Или хотите всё на одной странице `/carrier` без отдельного маршрута?

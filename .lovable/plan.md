# План: завершение MVP перевозчика

Объём большой, разбиваю на последовательные блоки. Не трогаю ATI-поиск, сделки, редизайн, nginx/PM2, service_role.

## Перед стартом — разведка (15 мин)
Прежде чем писать код, прочитать существующее, чтобы не дублировать и не сломать:
- `src/routes/carrier.onboarding.tsx` — текущие шаги, какие уже есть
- `src/routes/carrier.index.tsx` + `OnboardingChecklist.tsx`
- `src/routes/carrier.drivers.tsx`, `carrier.vehicles.tsx`
- `src/routes/api/carrier/*` — какие endpoints уже есть
- `src/routes/driver.register.$token.tsx` (есть ли уже) и `src/routes/carrier.activate.$token.tsx`
- `src/lib/dispatcher/invites.ts`, `src/server/invites.*`
- `src/components/dispatcher/VehicleForm.tsx`, `CarrierVehicleForm.tsx`
- `src/routes/api/dispatcher/free-vehicles.ts` — текущий readiness gate
- последнюю миграцию `20260617071045_*` — чтобы знать актуальную схему `dispatcher_*_ext`

## Блок 1. Онбординг-резюм и сохранение прогресса
- Миграция: убедиться, что у `dispatcher_carrier_ext` есть `onboarding_step text`, `onboarding_progress jsonb`, `onboarding_completed_at timestamptz`. Добавить недостающее идемпотентно (`add column if not exists`).
- API `PATCH /api/carrier/onboarding-status`: сохранять текущий шаг при переходе. `GET` уже считает прогресс — расширить, чтобы возвращал `currentStep` (последний сохранённый).
- В `/carrier/onboarding` запоминать шаг при каждом next/save; при заходе открывать `currentStep || nextIncompleteStep`.
- В `/carrier` (`OnboardingChecklist`): если `onboarding_completed_at` есть — карточка "Профиль готов к работе"; иначе — "Продолжить настройку" с прямой ссылкой на текущий шаг.

## Блок 2. Шаги онбординга (компания → водитель → транспорт)
В `/carrier/onboarding` довести до 11 секций (см. ТЗ). Каждая — отдельная подформа с автосейвом:
1. Данные компании (название, ИНН/КПП/ОГРН)
2. Контакты (телефон, email, мессенджеры)
3. ATI-код
4. ATI-почта
5. Налогообложение (enum: ОСНО/УСН доходы/УСН доходы-расходы/НПД/Патент)
6. Реквизиты (банк, БИК, р/с, к/с)
7. Документы компании (`CarrierDocumentsBlock`)
8. Первый водитель (с кнопкой "Я сам водитель")
9. Первый транспорт
10. Привязка водителя к машине
11. Готовность (показать gate-чек и перевести в `/carrier`)

При завершении 11 шага — записать `onboarding_completed_at = now()`.

## Блок 3. Расширенные поля водителя
Миграция (идемпотентно) на `dispatcher_driver_ext`:
- `email`, `whatsapp`, `telegram`, `max_messenger`, `city`
- `is_owner_driver bool` (перевозчик сам водитель)
- `is_hired bool`
- `license_categories text[]`, `experience_years int`, `license_number`, `license_expires_at`
- `medical_book bool`, `adr bool`, `permissions_note text`
- `documents_status text` (`missing|uploaded|in_review|approved|rejected`)
- `rejection_reason text`

Обновить `src/components/carrier/CarrierDriverForm.tsx` (или его эквивалент) с этими полями + чекбоксами и кнопкой "Я сам водитель" (создаёт/апдейтит `dispatcher_driver_ext` с `user_id = auth.uid()`, `is_owner_driver=true`).

## Блок 4. Ссылка-приглашение водителя
Проверить, что есть `src/routes/driver.register.$token.tsx`. Если нет — создать.
- API `POST /api/carrier/drivers/invite` → создаёт запись в `carrier_invites` (или `dispatcher_user_invites`) с типом `driver` и `carrier_ext_id`. Возвращает url.
- `src/routes/driver.register.$token.tsx`: публичная страница; если не залогинен — форма sign-up (email+password через стандартный `supabase.auth.signUp`, никакого admin). Если залогинен — сразу форма данных водителя. По submit создаёт `dispatcher_driver_ext` и линкует к `carrier_ext_id` из токена. Если у пользователя уже есть driver_ext — связать с carrier'ом, не дублировать.
- В `/carrier/drivers` кнопка "Отправить ссылку водителю" → диалог с url + копировать + WhatsApp/Telegram share.

## Блок 5. Транспорт — расширенные поля и тонны
Миграция `dispatcher_vehicle_ext`:
- `volume_m3 numeric`, `length_m`, `width_m`, `height_m`, `loading_methods text[]`, `body_features text[]`, `ready_to_go_city`, `ready_date`, `latitude`, `longitude`, `comment text`
- Снять `unique` с `assigned_driver_ext_id`, если был (идемпотентно).

Обновить `CarrierVehicleForm.tsx` / `VehicleForm.tsx`:
- Чекбокс-группа body_features (термо, рефр, тент, борт, изотерм, гидроборт, коники, верх/бок/зад загрузка, догруз)
- Чекбокс-группа loading_methods
- Поле `payload_capacity_kg` редактируется в тоннах через `src/lib/units.ts`
- Селект водителя — без unique, можно выбирать одного водителя на нескольких машинах.

## Блок 6. Readiness gate карты
`src/routes/api/dispatcher/free-vehicles.ts`: фильтр требует
- carrier_ext с заполненными полями + согласие на комиссию
- assigned_driver_ext_id IS NOT NULL
- (`current_city` IS NOT NULL OR (`latitude`,`longitude`) IS NOT NULL)
- payload_capacity_kg IS NOT NULL
- body_type IS NOT NULL
- НЕ archived/blocked

В `/carrier/vehicles` — на каждой карточке машины показывать причину, почему не на карте (`computeVehicleReadiness(vehicle, driver, carrier) → {ready: bool, reason: string}`). Утилиту положить в `src/lib/dispatcher/vehicle-readiness.ts`.

## Блок 7. Документы — статусы
Уже есть `dispatcher_documents` и `CarrierDocumentsBlock`. Добавить вычисление статуса (missing/uploaded/in_review/approved/rejected) и бэйдж в карточках водителя/машины/перевозчика.

## Блок 8. Мобильный UX
В формах онбординга:
- `min-h-[100dvh]`, `overscroll-contain`, `pb-[env(safe-area-inset-bottom)]`
- sticky footer кнопок Назад/Сохранить и продолжить
- toast "Сохранено" после autosave
- Все блоки внутри `ScrollArea` / нативный скролл с `overflow-y-auto`

## Блок 9. Существующие пользователи
- `/carrier` всегда сначала зовёт `onboarding-status`. Если не complete — баннер "Продолжить настройку" со ссылкой на текущий шаг.
- При создании новых записей всегда `upsert` по `(carrier_ext_id, ...)`, не insert вслепую.

## Блок 10. Финальная проверка
- `tsc --noEmit` через автоматический build
- ручной smoke: регистрация → онбординг → водитель → транспорт → проверка появления на /dispatcher/map

## Технические детали

**Миграции (одна объединённая, идемпотентная):**
```sql
ALTER TABLE public.dispatcher_carrier_ext
  ADD COLUMN IF NOT EXISTS onboarding_step text,
  ADD COLUMN IF NOT EXISTS onboarding_progress jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.dispatcher_driver_ext
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS max_messenger text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS is_owner_driver bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hired bool DEFAULT true,
  ADD COLUMN IF NOT EXISTS license_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS experience_years int,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_expires_at date,
  ADD COLUMN IF NOT EXISTS medical_book bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS adr bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions_note text,
  ADD COLUMN IF NOT EXISTS documents_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS volume_m3 numeric,
  ADD COLUMN IF NOT EXISTS length_m numeric,
  ADD COLUMN IF NOT EXISTS width_m numeric,
  ADD COLUMN IF NOT EXISTS height_m numeric,
  ADD COLUMN IF NOT EXISTS loading_methods text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body_features text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ready_to_go_city text,
  ADD COLUMN IF NOT EXISTS ready_date date,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS documents_status text DEFAULT 'missing';

-- снять unique на водителе, если был
ALTER TABLE public.dispatcher_vehicle_ext
  DROP CONSTRAINT IF EXISTS dispatcher_vehicle_ext_assigned_driver_ext_id_key;
DROP INDEX IF EXISTS dispatcher_vehicle_ext_assigned_driver_ext_id_idx;
```

**API изменения:**
- `GET/PATCH /api/carrier/onboarding-status` — расширен (step)
- `POST /api/carrier/drivers/invite` — новая
- `GET/POST /api/driver/register-by-token` — новая (публичная, проверяет токен)
- `GET/PATCH /api/carrier/driver-ext/$id` — расширенные поля
- `GET/PATCH /api/carrier/vehicle-ext/$id` — расширенные поля
- `/api/dispatcher/free-vehicles` — расширен readiness gate

**Безопасность:** Все приглашения — через существующий `carrier_invites`/`dispatcher_user_invites`. Создание auth user — только через стандартный `supabase.auth.signUp` со стороны клиента, без admin API.

## Что НЕ делается
- ATI-парсинг и поиск грузов
- Сделки, счета, акты
- Email-рассылки, звонки, SMS
- Перерисовка дизайна
- Нет миграций на orders/routes/clients и старой логистике

## Объём
Это ~12–15 файлов изменено, ~3–5 новых, 1 миграция. Реализую в одном проходе.

## Проверка на production (radius-track.ru)
1. Новый перевозчик: register → попадает в /carrier → видит "Продолжить настройку" → проходит все шаги.
2. Выход на середине → возврат → продолжает с того же шага.
3. Загрузка фото документов с телефона.
4. Кнопка "Я сам водитель" создаёт водителя с user_id.
5. "Отправить ссылку водителю" → копирование url → открытие на другом устройстве → регистрация → появление в списке.
6. Создать машину с водителем + город + грузоподъёмность → появляется в /dispatcher/map.
7. Создать машину без водителя/города → НЕ появляется, в /carrier/vehicles показана причина.
8. Один водитель на двух машинах — обе сохраняются.
9. Существующий перевозчик после деплоя видит "Продолжить настройку", не регистрируется заново.

Подтвердите план, и я начну реализацию.

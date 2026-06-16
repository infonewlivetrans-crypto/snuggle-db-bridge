# MVP: перевозчик → водитель → предложение груза (без ATI)

Объём слишком велик для одного безопасного прохода. Чтобы не сломать уже работающие части (кабинет, документы, RLS, AI-диспетчер), предлагаю выполнить как один **связанный** проход, разбитый на 4 коммита внутри одного прохода. Я ничего не пропускаю, но иду в порядке зависимостей.

## Что уже есть и не трогаю
- `/carrier/register`, `/carrier`, `/carrier/vehicles`, `/carrier/drivers` (формы и API)
- RLS на `dispatcher_carrier_ext`, `dispatcher_vehicle_ext`, `dispatcher_driver_ext`, `dispatcher_documents` + storage
- `CarrierDocumentsBlock`, `CarrierVehicleFormDialog`, `CarrierDriverFormDialog`
- carrier_my_ext_id() RPC

## Коммит 1 — фиксы регистрации и транспорта (срочное)
1. **401 на `/carrier/register`** — в `routes/carrier.register.tsx` и `__root`/layout убрать вызовы `/api/carrier/*` для гостей. На публичной странице рендерить только форму, не монтировать `<CarrierShell/>` и его loader.
2. **500 `cannot extract elements from a scalar`** в `PATCH /api/carrier/vehicles/:id`:
   - нормализация массивных полей на фронте (`CarrierVehicleFormDialog`): `load_methods`, `ready_to_cities`, `ready_weekdays`, `directions`, `body_type` → если строка → split, если null → [], если массив → as-is
   - в server endpoint и RPC: перед `jsonb_array_elements_text` проверять `jsonb_typeof(x) = 'array'`; иначе 400 `validation_failed`

## Коммит 2 — карточка перевозчика, документы, GPS/город
1. **Мои данные**: расширить форму `/carrier` всеми полями (тип, ИНН/КПП/ОГРН, юр./факт. адрес, контакты, мессенджеры, ATI ID, реквизиты, способ оплаты комиссии, комментарий). Поля уже есть в `dispatcher_carrier_ext` — добавить недостающие столбцы миграцией только если отсутствуют. Кнопка "Заполнить по ИНН" — `disabled`.
2. **Документы компании**: расширить enum типов в `CarrierDocumentsBlock` (карточка, ИНН, ОГРН, паспорт, реквизиты, договор, согласие на комиссию, доверенность, прочий). Хранение: `dispatcher_documents.doc_type` + `comment` + `status`.
3. **GPS-первый**: в `UpdateMyLocationButton` и `vehicles/:id/location` уже есть browser geolocation + Yandex reverse. Добавить поле `location_source` в `dispatcher_vehicle_ext` (`gps`/`yandex`/`manual`/`admin`) и показывать в карточке машины.
4. **Документы транспорта**: `CarrierDocumentsBlock ownerType="vehicle"` уже есть — добавить в страницу `/carrier/vehicles` раскрытие машины с её документами (СТС, ПТС, ОСАГО, ДК, договор, фото, прочий).
5. **Документы водителя**: то же для `ownerType="driver"` на `/carrier/drivers` (паспорт, ВУ, доверенность, медсправка, прочий).

## Коммит 3 — модерация комплектности + карта партнёра
1. Добавить в `dispatcher_carrier_ext`/`_vehicle_ext`/`_driver_ext` поля:
   - `moderation_status`: `pending` | `docs_missing` | `ready_to_work` | `rejected`
   - `moderation_comment text`
   - `ready_to_work boolean` (вычисляемое + апдейтится модератором)
2. RPC `carrier_check_completeness(_carrier_id, _vehicle_id, _driver_id)` → возвращает чего не хватает; SECURITY DEFINER.
3. На `/carrier` показывать блок "Что нужно исправить" с комментарием модератора.
4. В `dispatcher_carriers`/`dispatcher_vehicles`/`dispatcher_drivers` (админская часть) добавить кнопки "Принят" / "Отклонён" с комментарием — на существующих страницах.
5. **Карта партнёра**: компонент `PartnerCard` на `/carrier` (и preview для диспетчера) — собирает данные из существующих таблиц, без новой сущности. Только просмотр/печать.

## Коммит 4 — кабинет водителя + предложение груза
1. **Driver invite**: использовать существующий `carrier/driver-invites` API. UI в `/carrier/drivers/:id` — кнопки create / copy / revoke.
2. **Driver public link**: маршрут `/driver/invite/$token` — телефон + пароль → создаёт `auth.users` + связывает с `dispatcher_driver_ext` (через существующую RPC если есть, иначе новую `accept_driver_invite`).
3. **`/driver`**: расширить существующий — свои данные, машина, готовность, рейсы, задачи по маршруту. Задачи: enum `trip_stage` (принять / прибыл загрузка / загружен / выехал / прибыл выгрузка / выгружен / фото / завершить). Использовать существующий `trip-stage.server.ts`.
4. **GPS водителя**: тот же `UpdateMyLocationButton` подход на `/driver`.
5. **Диспетчер: создать груз вручную** — на `/dispatcher/freights` уже есть форма; убедиться что работает без ATI; добавить кнопку "Предложить перевозчику" → выбор carrier+vehicle+driver с проверкой `ready_to_work` и совместимости (кузов/вес/объём).
6. **Предложение перевозчику**: новая таблица `dispatcher_freight_offers` (freight_id, carrier_ext_id, vehicle_ext_id, driver_ext_id, status: `pending`/`accepted`/`declined`, rate, commission, comment, created_at, decided_at). RLS: перевозчик видит свои. На `/carrier` блок "Предложения" со списком + кнопки "Взять рейс" / "Отказаться".
7. **После "Взять рейс"**: создаётся запись в `dispatcher_tasks` ("Позвонить заказчику", assignee=диспетчер, freight_id). Карта партнёра доступна диспетчеру.

## Технический контракт
- Все эндпоинты — user-client + RLS / SECURITY DEFINER. Никакого `service_role`, `makeAdminClient`, `auth.admin`.
- Все CREATE TABLE с GRANT + RLS + policies в одной миграции.
- Никаких изменений в nginx/PM2/DNS/storage proxy/AI-карты.
- `tsc --noEmit` и build обязательны зелёные.

## Что НЕ делаю в этом проходе (по требованию)
ATI, AI-поиск, DaData, почта, отправка заказчику, акты, счета, банковские дни, оплата, редизайн, отчёты, склад.

## Объём
~25–35 файлов: 4 миграции, 8–10 новых/расширенных API эндпоинтов, 6–8 UI-компонентов, 2 новых маршрута (`/driver/invite/$token` расширение существующего, `/driver` расширение).

Подтверди план — начну с Коммита 1 (срочные фиксы 401 и 500), дальше пойду по порядку без остановок.

## Объединённый MVP-этап AI-диспетчера

Работаем поверх существующих компонентов: `BuildOfferDialog`, `VehicleMapPanel`, `FreeVehiclesBlock`, `VehicleForm`, `CarrierVehicleForm`, `DriverForm`. Никаких новых разделов, никаких параллельных сущностей. Без `service_role`, без `auth.admin`, без ATI/AI/почты/звонков.

---

### Задача 1. Грузоподъёмность в тоннах

В БД остаётся `payload_kg` (kg) — старые данные не ломаем. Меняем только UI.

- Новый утиль `src/lib/units.ts`:
  - `kgToTons(kg)`, `tonsToKg(t)`, `parseTons("1,5"|"1.5"|"3")`, `formatTons(kg)` → `"1,5 т"`, `"20 т"`.
- В формах (`CarrierVehicleForm`, dispatcher `VehicleForm`) поле подписать «Грузоподъёмность, т», placeholder `1,5`. На submit → `tonsToKg`. При загрузке initial → `kgToTons`.
- В отображении (`FreeVehiclesBlock` карточки + ряды, `VehicleMapPanel` боковая панель и popup, `dispatcher.vehicles.tsx` колонка, `carrier.vehicles.tsx`) заменить `fmtNum(payload_kg) + " кг"` на `formatTons(payload_kg)`. Свободный вес — тоже в тоннах. Объём — `м³` как было.
- Колонки free_payload_kg/free_volume_m3 не трогаем в БД.

### Задача 2. Скролл модалок (Dialog/Sheet)

- В `BuildOfferDialog`: обернуть тело в `max-h-[90dvh] flex flex-col`, header `shrink-0`, контент `flex-1 overflow-y-auto overscroll-contain px-* pb-*`, footer-кнопки `shrink-0 sticky bottom-0 bg-background border-t`.
- В `VehicleMapPanel` боковая `Sheet`/панель машины: тот же шаблон, отдельный `ScrollArea` для контента, нижние кнопки sticky.
- В `FreeVehiclesBlock` модалка деталей: same.
- На мобильном (`md:` breakpoint) — `Dialog` на весь экран: `w-screen h-[100dvh] max-w-none rounded-none sm:rounded-lg sm:h-auto sm:max-h-[90vh] sm:w-auto`.
- Touch: `touch-action: pan-y` на scroll-контейнере.

### Задача 3. Карточка машины/водителя на карте

Расширяем `VehicleMapPanel` детальную панель (правую/Sheet), используя данные из `dispatcher_vehicle_ext` + JOIN на `dispatcher_carrier_ext`, `dispatcher_driver_ext` через существующий `/api/dispatcher/vehicles/:id` (если данных не хватает — расширить SELECT в этом эндпоинте, без новых RPC).

Три блока: **Транспорт / Перевозчик / Водитель**. Для контактов — компонент `ContactLinks` (уже есть). Кнопки:
- `tel:`, `https://wa.me/<digits>`, `https://t.me/<username>`, `https://max.ru/<id>` (или сырая ссылка, если поле уже URL). Если поле пустое — кнопка не рендерится.
- Действия: «Собрать предложение рейса» (открывает `BuildOfferDialog` с `vehicleId`), «Открыть машину» → `/dispatcher/vehicles?id=…`, «Открыть перевозчика», «Открыть водителя».

### Задача 4. Упрощённая форма «Собрать предложение рейса»

Переписываем `BuildOfferDialog` под секционную форму (всё в одном компоненте, секции через `<section>`):

1. **Транспорт** (readonly шапка — машина/водитель/перевозчик, тянем по `vehicleId` через существующий `/api/dispatcher/vehicles/:id`).
2. **Помощник разбора текста** (см. задачу 5) — сверху.
3. **Груз №1** + кнопка `+ добавить груз` → массив `cargo_items` в state.
4. **Маршрут груза** + `+ точка загрузки / + точка выгрузки / + ехать через` → массив `route_points`.
5. **Способы загрузки/выгрузки** — чекбоксы.
6. **Ставка** — поля + select НДС, торг, оплата, банк. дни, прямой договор.
7. **Контакты заказчика**.
8. **Итог** — посчитанные суммы веса/объёма/ставки.

Кнопки: «Сохранить черновик» (POST `/api/dispatcher/freights`), «Отправить перевозчику» — `disabled` с подписью «Будет доступно после следующего этапа», «Отмена».

Валидация мягкая, ошибки: «Не хватает города загрузки», «Не хватает ставки», «Не выбран транспорт». Используем `sonner` toasts.

### Задача 5. Парсер текста груза

`src/lib/dispatcher/freight-parse.ts` уже существует — расширяем его (regex/эвристики, без AI):

- Кузов: `/закр|тент|реф|изотерм|терм|контейнер|изотерм/i` → `body_type`.
- Вес/объём: `/(\d+[.,]?\d*)\s*\/\s*(\d+[.,]?\d*)/` → `weight_t`, `volume_m3` (первая = тонны, вторая = м³).
- Упаковка/места: `/палет[ыа]?\s*-?\s*(\d+)\s*шт/i`.
- Догруз: `/догруз/i`.
- Города/адреса: split по строкам — первая «крупная» строка после блока веса = город загрузки; следующая — регион; следующая = адрес; «готов <date> <time>».
- Город выгрузки: ищем после «готов …» следующий блок «Город» + адресная строка.
- Ставка: `/(\d[\d\s]*)\s*руб/`, `/без НДС|с НДС/i`, `/(\d+[.,]?\d*)\s*руб\/км/`, `/на выгр|после док|предопл|отсрочк/i`, `/без торга|торг/i`, `/прям\.?\s*дог/i`.
- Контакты: телефоны `/\+?7[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/g`; ATI код `/Код:?\s*(\d{4,})/`; компания — строка перед «Код:»; ФИО — следующая после телефонов строка из 2 слов с заглавных.

API: чистая функция `parseFreightText(text): Partial<OfferDraft>`. Кнопка «Разобрать текст» в форме вызывает её и `merge` в state (не перетирая уже изменённые поля). Toast: успех / частичный успех.

### Задача 6. Хранение черновика

Миграция (idempotent), добавляем в `dispatcher_freights`:
- `source_text text`
- `parsed_payload jsonb`
- `cargo_items jsonb` (если ещё нет)
- `route_points jsonb` (если ещё нет)
- `offer_status text default 'draft'`
- `assigned_vehicle_id uuid`, `assigned_driver_id uuid`, `assigned_carrier_id uuid`

(Только `ADD COLUMN IF NOT EXISTS`. Никаких FK/constraint-замен.)

API `/api/dispatcher/freights` (POST) расширить: принимает новые поля, сохраняет в jsonb. RLS — без изменений (диспетчер уже имеет write).

### Задача 7. Мобильная адаптация

Применяется через шаблон из задачи 2 + крупные кнопки (`h-11 text-base`), `inputMode="decimal"` для числовых, `type="tel"` для телефонов, `safe-area-inset-bottom` для sticky footer.

### Задача 8. Понятные сообщения

Toasts через `sonner` (уже подключён) — словарь в начале `BuildOfferDialog`. Технические ошибки логируются в console, пользователю — нейтральный текст.

---

### Файлы

**Новые:**
- `src/lib/units.ts`
- (расширение) `src/lib/dispatcher/freight-parse.ts`

**Меняем:**
- `src/components/carrier/CarrierVehicleForm.tsx` — поле в тоннах
- `src/components/dispatcher/VehicleForm.tsx` — поле в тоннах
- `src/components/dispatcher/FreeVehiclesBlock.tsx` — отображение тонн
- `src/components/dispatcher/VehicleMapPanel.tsx` — карточка + popup + контакты + кнопка «Собрать предложение»
- `src/components/dispatcher/BuildOfferDialog.tsx` — полный рестайл формы + парсер + скролл
- `src/routes/dispatcher.vehicles.tsx`, `src/routes/carrier.vehicles.tsx` — колонки тонн
- `src/routes/api/dispatcher/vehicles.$id.ts` — расширить SELECT (carrier, driver контакты)
- `src/routes/api/dispatcher/freights.ts` — принимать новые поля

**Миграции:**
- одна idempotent миграция с `ADD COLUMN IF NOT EXISTS` для `dispatcher_freights`.

### Что не трогаем

`/api/carrier/*` рабочие; nginx, PM2, DNS, storage; старые routes/orders; сделки/оплата; полный документооборот; ATI/AI/почта.

### Проверка на production

1. `/carrier/vehicles` — ввод `1,5` → сохраняется → отображается `1,5 т`.
2. `/dispatcher/vehicles` колонка тонн.
3. `/dispatcher/map` — клик по машине → панель скроллится на iPhone/Max; видны все блоки и контакты.
4. Кнопка «Собрать предложение рейса» → диалог открывается, скролл работает, вставка примера ATI → поля заполняются, «Сохранить черновик» создаёт запись в `dispatcher_freights` с `offer_status='draft'`.
5. На существующих машинах со старыми kg значениями отображение корректное.
6. `tsc --noEmit` и `npm run build` — без ошибок.

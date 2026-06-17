
# Подпись и печать перевозчика на входящих документах

Точечный этап поверх существующих «Входящих документов». Старые модули (склад, QR, ATI, AI-поиск, касса, nginx/PM2/DNS) не трогаю. Только user-client + RLS, без service_role / auth.admin.

## 1. Миграции (одной supabase--migration)

### Таблица `carrier_signature_assets`
- `carrier_ext_id uuid not null` (FK на `dispatcher_carrier_ext.id`)
- `uploaded_by uuid` (auth user)
- `source_file_path text` — исходный лист
- `stamp_file_path text` — PNG печати с прозрачным фоном
- `signature_file_path text` — PNG подписи с прозрачным фоном
- `stamp_bbox jsonb`, `signature_bbox jsonb` — координаты кадра на исходнике
- `bg_removal jsonb` — `{threshold, contrast}` для повторной обработки
- `is_active boolean default true`
- `consent_confirmed_at timestamptz`
- `created_at`, `updated_at`
- GRANT для `authenticated` + `service_role`; RLS:
  - carrier (через `dispatcher_carrier_users` / `carrier_account_links`) видит/правит только свои;
  - admin/dispatcher — все.

### Таблица `dispatcher_document_signatures`
- `inbound_document_id uuid` (FK `dispatcher_inbound_documents`)
- `trip_id uuid null` (FK `dispatcher_trips`)
- `carrier_ext_id uuid not null`
- `source_document_path text not null`
- `signed_document_path text` — авто-подписанный PDF
- `manual_signed_document_path text` — ручной скан
- `signature_asset_id uuid` (FK `carrier_signature_assets`)
- `status text default 'draft'` — `draft|preview|signed|manual_uploaded|failed|cancelled`
- `placement jsonb` — `{page, stamp:{x,y,w}, signature:{x,y,w}}`
- `signed_by uuid`, `signed_at timestamptz`
- `created_at`, `updated_at`
- RLS: carrier — свои (по `carrier_ext_id`), admin/dispatcher — все, driver — только если `trip_id` назначен ему.

### Storage
- Использую существующий приватный bucket `inbound-documents`, новый префикс `signatures/{carrier_ext_id}/...` и `signed/{carrier_ext_id}/{inbound_id}/...`.
- Политики на `storage.objects` — по аналогии с уже существующими для `inbound-documents`.

## 2. Серверная обработка изображений (sharp недоступен в Worker)

Worker-совместимый стек: `@jsquash/png` + чистый JS пиксельный проход.
- Декодируем JPG/PNG/HEIC → RGBA (HEIC принимаем как PNG если браузер уже отдал, иначе сообщаем «не получилось»).
- Кадрируем по `bbox`.
- Удаляем белый/светло-серый фон: для каждого пикселя `luma = 0.299R+0.587G+0.114B`; если `luma > threshold` (по умолчанию 235) → `alpha=0`; в переходной зоне (210..235) → плавный alpha.
- Опционально усиливаем контраст оставшихся пикселей (поднимаем насыщенность синего/фиолетового для печати).
- Кодируем PNG с альфой.
- Параметры `{threshold, contrast}` сохраняются в `bg_removal`, чтобы можно было пересчитать с UI.

Файлы:
- `src/server/signatures/image.server.ts` — `cropAndRemoveBackground(buffer, bbox, opts)`
- `src/server/signatures/storage.server.ts` — загрузка/чтение из bucket через user-client.

## 3. Серверная вставка в PDF

`pdf-lib` (pure JS, Worker-safe, уже разрешён в проекте).

Файл: `src/server/signatures/pdf-sign.server.ts`
- `loadPdf(buffer)`, `embedPng(stamp)`, `embedPng(signature)`.
- `findCarrierAnchor(parsedText, carrierName, carrierInn)` — ищет на каждой странице (через уже существующий `parser.server.ts` извлекатель текста с координатами; если координат нет — возвращает только номер страницы):
  - якоря: «Перевозчик», «Исполнитель-перевозчик», «Исполнитель перевозчик», название компании, ИНН перевозчика, «М.П.», «подпись»;
  - **критично**: «М.П.» сама по себе не используется, только в сочетании с якорем перевозчика; если на странице есть и «Заказчик», и «Перевозчик» — выбираем нижне-правый блок, ближайший к якорю «Перевозчик».
- `placeSignature(pdf, placement)` — вставляет PNG'и (только альфа-канал, без белого прямоугольника) по координатам PDF user space.
- Если уверенности нет → возвращаем `needs_manual_placement: true` с дефолтом (последняя страница, правый нижний угол).

## 4. API (общие endpoints + проверка ролей)

Все — `createServerFn`/server routes с `requireSupabaseAuth`. Carrier vs dispatcher решаем внутри по `has_role` и принадлежности `carrier_ext_id`.

### Signature assets
- `GET /api/carrier/signature-assets` — список своих (для carrier) или по `carrier_ext_id` query (для admin/dispatcher).
- `POST /api/carrier/signature-assets` — `multipart`: `source_file`, `consent=true`. Возвращает запись + signed URL исходника.
- `POST /api/carrier/signature-assets/:id/process` — `{stamp_bbox, signature_bbox, bg_removal}` → пересчитывает PNG'и, обновляет пути и bbox. Возвращает signed URL'ы предпросмотра.
- `PATCH /api/carrier/signature-assets/:id` — `{is_active}`.
- `DELETE /api/carrier/signature-assets/:id`.

### Подписание входящего документа
- `POST /api/dispatcher/inbound-documents/:id/sign-preview` — выбирает активный `signature_asset`, ищет якорь, возвращает `{placement, needs_manual_placement, preview_url}` (preview = PDF, сгенерированный с текущим placement; сохраняем под `signed_document_path` в статусе `preview`).
- `POST /api/dispatcher/inbound-documents/:id/sign-confirm` — `{placement}` → финальный PDF, статус `signed`, привязка к `dispatcher_trip_documents`, если `trip_id` уже есть.
- `POST /api/dispatcher/inbound-documents/:id/manual-signed-upload` — `multipart` (PDF/JPG/PNG/HEIC) → `manual_uploaded`, привязка к рейсу.
- Те же три под `/api/carrier/inbound-documents/:id/...` (тонкие обёртки, делегируют общему хэндлеру, проверяя что документ принадлежит carrier'у пользователя).

### Trip linkage
При `sign-confirm` / `manual-signed-upload`, если у `dispatcher_inbound_documents.trip_id` уже есть значение — вставляем строку в `dispatcher_trip_documents` (`kind='signed_contract'`).
При `create-trip` (существующий endpoint) — после создания рейса проверяем `dispatcher_document_signatures` со статусом `signed|manual_uploaded` и автоматически прикрепляем.

## 5. UI

### `/carrier/signature-settings.tsx` (новая страница)
- Инструкция «как сфотографировать лист».
- Загрузка файла (drag&drop + camera input на мобиле).
- После загрузки: канвас с исходным фото.
- Два режима выделения: «Выделить печать», «Выделить подпись» — прямоугольное выделение мышью/тачем (используем существующие `@radix-ui` примитивы + кастомный canvas, без новых тяжёлых зависимостей).
- Слайдеры `Порог фона (210–245)`, `Контраст`.
- Кнопка «Обработать» → отправляет на `/process`.
- Два предпросмотра PNG поверх условного «бумажного» белого фона документа.
- Чекбокс «Подтверждаю, что имею право использовать эту печать и подпись» → активирует кнопку «Сохранить».
- Список ранее загруженных, переключение активного.

В `/carrier` (dashboard) — карточка-статус: «Печать и подпись: загружены/не загружены», ссылка на страницу.

### `/dispatcher/inbound-documents/:id` (расширяем существующую)
Новый блок «Подписание документа перевозчиком». Состояния, как в ТЗ:
1. Нет активной печати → CTA «Попросить перевозчика загрузить» (просто инструкция/копия ссылки) + «Загрузить вручную подписанный».
2. Печать есть → «Подготовить подпись» (вызывает `sign-preview`) и «Загрузить уже подписанный».
3. После preview → компонент `SignaturePlacementEditor`:
   - iframe/`<object>` с preview PDF.
   - Поверх — overlay-канвас с двумя draggable/resizable элементами (печать, подпись).
   - На мобиле: переключатель «Жесты / Поля» — поля X/Y/размер и кнопки ←→↑↓/+/−, шаг 5pt.
   - Селектор страницы.
   - Кнопки «Сохранить подписанный документ» (→ `sign-confirm`), «Отменить».
4. После `signed` → «Открыть подписанный PDF» (signed URL), кто/когда.

### `/carrier/inbound-documents/:id` (страница уже есть как часть `CarrierInboundDocsBlock` — расширяем)
Упрощённая версия того же flow: «Открыть», «Подписать», «Загрузить скан», «Подтвердить».

### `/driver/trip/$tripId.tsx`
Уже умеет показывать `dispatcher_trip_documents`. Просто убеждаемся, что подписанный документ виден как «Договор-заявка (подписан)», только просмотр/скачивание (signed URL).

### Создание рейса
В существующем диалоге `create-trip` (на `/dispatcher/inbound-documents/:id`) добавляем баннер «Документ ещё не подписан перевозчиком. Можно создать задание, документ будет в статусе ожидает подписания». Кнопка остаётся активной — оба варианта разрешены.

## 6. Сообщения и аудит

- Все user-facing сообщения — как в ТЗ, через `toast`.
- Серверные логи: `requestId, inbound_document_id, carrier_ext_id, signature_asset_id, page, placement, error`.
- В `dispatcher_document_signatures.updated_at` отражаем последнее действие; история по статусам = достаточная аудит-цепочка для MVP.

## 7. Зависимости
- `pdf-lib` — добавляю, если не стоит (Worker-safe).
- `@jsquash/png` — добавляю для PNG encode/decode с alpha (Worker-safe, без native).
- HEIC: если браузер отдал готовый PNG/JPG — обрабатываем; чистый HEIC буфер на сервере не декодируем (нет Worker-safe библиотеки), показываем понятную ошибку.

## 8. Проверки
- `tsc --noEmit` после правок.
- `npm run build` (через harness).
- Ручной smoke в preview: загрузка листа → выделение → удаление фона → подпись pdf → drag в редакторе → сохранение → видно в trip documents.

## 9. Out of scope
ЭДО, КЭП/УКЭП, OCR сканов, авто-определение печати CV-моделью, batch-подписание, изменения в /carrier/register, /driver/* кроме просмотра документа, новые роли, изменения старой логистики/склада/QR/кассы/ATI/AI-поиска, nginx/PM2/DNS/storage proxy.

## 10. Готовность
Только после переноса на VPS и ручной проверки на radius-track.ru.

---

## Технические детали (для разработчика)

### Структура файлов
```
src/server/signatures/
  image.server.ts        // crop + bg removal (jsquash)
  pdf-sign.server.ts     // pdf-lib: embed + place
  storage.server.ts      // signed URLs, uploads через user-client
src/lib/signatures/
  schemas.ts             // zod: BBox, Placement, BgRemoval
  api.ts                 // тонкие клиенты для fetch
src/routes/api/carrier/signature-assets.ts
src/routes/api/carrier/signature-assets.$id.ts
src/routes/api/carrier/signature-assets.$id.process.ts
src/routes/api/dispatcher/inbound-documents.$id.sign-preview.ts
src/routes/api/dispatcher/inbound-documents.$id.sign-confirm.ts
src/routes/api/dispatcher/inbound-documents.$id.manual-signed-upload.ts
src/routes/api/carrier/inbound-documents.$id.sign-preview.ts
src/routes/api/carrier/inbound-documents.$id.sign-confirm.ts
src/routes/api/carrier/inbound-documents.$id.manual-signed-upload.ts
src/routes/carrier.signature-settings.tsx
src/components/signatures/SignatureAssetEditor.tsx   // canvas crop + bg sliders
src/components/signatures/SignaturePlacementEditor.tsx // pdf overlay + drag/inputs
src/components/dispatcher/InboundSignatureBlock.tsx
src/components/carrier/CarrierSignatureStatusCard.tsx
```

### Схема placement
```ts
type Placement = {
  page: number;          // 1-based
  stamp:     { x: number; y: number; w: number }; // PDF pt, h = w * aspect
  signature: { x: number; y: number; w: number };
};
```

### Поиск якоря перевозчика (псевдокод)
```
for page in pages:
  text = extractText(page)
  hasCarrier  = matches(text, ["Перевозчик","Исполнитель-перевозчик", carrierName, carrierInn])
  hasCustomer = matches(text, ["Заказчик","Грузовладелец"])
  if hasCarrier:
    side = (hasCustomer ? "bottom-right" : "bottom")
    return { page, anchor: side, confidence: hasCarrier.score }
return { page: lastPage, anchor: "bottom-right", needsManual: true }
```

### Удаление фона (псевдокод)
```
for each px (r,g,b):
  l = 0.299r+0.587g+0.114b
  if l >= hi(245):      a = 0
  elif l >= lo(210):    a = round(255 * (hi - l)/(hi - lo))
  else:                 a = 255; (r,g,b) = boostContrast(r,g,b, k)
```


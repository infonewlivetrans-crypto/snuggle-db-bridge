# Этап: Входящие подписанные заявки → разбор → задание водителю

Объём огромный (миграции, IMAP-сбор, парсеры PDF/DOC/DOCX, OCR-заглушка, UI для перевозчика и диспетчера, привязка к рейсу, создание trip). Делю на проверяемые подэтапы, чтобы не сломать существующий кабинет перевозчика, диспетчера и водителя.

## 1. БД и storage

Миграция (идемпотентная):
- `dispatcher_inbound_documents` со всеми полями из ТЗ (`carrier_ext_id`, ссылки на deal/freight/trip, email_*, attachment_*, storage_*, `processing_status`, `document_kind`, `extracted_text`, `parsed_payload jsonb`, `parse_confidence`, `parse_warnings text[]`, `error_message`, timestamps).
- Уникальный индекс `(carrier_ext_id, email_message_id, attachment_hash)` для идемпотентности.
- `dispatcher_carrier_email_accounts`: добавить `imap_host/port/secure/user/encrypted_password`, `last_inbox_check_at`, `last_inbox_uid` (расширение существующей SMTP-таблицы).
- `dispatcher_carrier_email_messages_seen`: лог обработанных `email_message_id` per carrier (для скорости проверки дублей до скачивания вложений).
- RLS: admin/dispatcher — всё; carrier — свои по `dispatcher_carrier_users`; driver — только документы своего назначенного `dispatcher_trip_id`.
- GRANTs на `authenticated` и `service_role`.
- Storage bucket `inbound-documents` (private), RLS policies на `storage.objects`.

## 2. Парсер документов `src/server/inbound/parser.server.ts`

- Универсальный конвейер: `parse(file, mime) → { text, warnings }` → `extractFields(text) → ParsedPayload`.
- Извлечение текста:
  - PDF: `pdf-parse` (pure JS, Worker-safe).
  - DOCX: `mammoth` (extractRawText).
  - DOC: попытка через `mammoth`; если падает — `needs_review`.
  - JPG/PNG/HEIC: без OCR в MVP → `needs_review` со статусом «похоже на скан».
  - TXT/EML body: напрямую.
- `extractFields` — эвристики по русским синонимам (списки из ТЗ), regex-парсеры:
  - даты (DD.MM.YYYY, «20 июня 2026»), время (HH:MM, диапазоны).
  - ИНН (10/12 цифр), телефоны (+7…), email, госномер RU.
  - вес (т/кг), объём (м3), ставка (с НДС/без НДС/НДС не облагается, наличные/безнал/предоплата/отсрочка N банковских дней).
  - блоки «Погрузка/Выгрузка»: ищем секции, внутри — адрес/дата/контакт.
  - заказчик/перевозчик по разделам и контексту вокруг ИНН.
- Возврат строго по схеме из ТЗ, `null` если не найдено, `warnings[]` со списком пропущенных полей и `confidence` (доля найденных ключевых полей).
- Match-логика: сопоставление с `dispatcher_deals/freights/dispatcher_carrier_requests` по email отправителя, ставке, маршруту, датам, госномеру → `matched_*_id` + `match_confidence` + `match_reasons[]`.

## 3. IMAP-сбор `src/server/inbound/imap.server.ts`

- `nodemailer` уже стоит; добавить `imapflow` + `mailparser` (оба Worker-совместимы через nodejs_compat).
- `syncInbox(carrierExtId)`: подключается к IMAP перевозчика, читает последние 50 писем / 30 дней с вложениями PDF/DOC/DOCX/JPG/PNG, фильтрует по теме/телу (заявка/договор-заявк/рейс/маршрут/перевозк), для каждого вложения:
  - sha256 hash → upsert в `dispatcher_inbound_documents` (skip при дубле).
  - upload в `inbound-documents/{carrier_ext_id}/{yyyy}/{mm}/{hash}-{filename}`.
  - status=`saved`.
- После сохранения — фоновый вызов `parseInboundDocument(id)`: переводит в `parsing`→`parsed`/`needs_review`/`failed`.
- Все секреты IMAP — зашифрованы тем же `EMAIL_ENCRYPTION_KEY`.

## 4. API (server functions + server routes)

Защищённые (требуют `requireSupabaseAuth`):
- `POST /api/carrier/inbound-documents/sync` — кнопка «Проверить почту» (carrier видит только свой carrier_ext_id).
- `GET  /api/carrier/inbound-documents` — список своих.
- `GET  /api/dispatcher/inbound-documents` + `/:id` — для admin/dispatcher.
- `POST /api/dispatcher/inbound-documents/:id/parse` — перезапуск разбора.
- `PATCH /api/dispatcher/inbound-documents/:id` — правки `parsed_payload`, статус, link к deal/trip.
- `POST /api/dispatcher/inbound-documents/:id/link` — ручная привязка.
- `POST /api/dispatcher/inbound-documents/:id/create-trip` — создаёт `dispatcher_trips` + `dispatcher_trip_points` + копирует вложения в `dispatcher_trip_documents` (idempotent через `client_request_id`).
- `POST /api/dispatcher/inbound-documents/:id/ignore`.

## 5. UI

Перевозчик (`/carrier`):
- Блок `CarrierInboundDocsBlock`: кнопка «Проверить почту», список последних входящих, статус, ссылка «Открыть».

Диспетчер:
- Новый роут `/dispatcher.inbound-documents.tsx`: список входящих, фильтры по статусу/перевозчику, бейджи «нужна ручная проверка», «привязано», «черновик готов».
- Роут `/dispatcher.inbound-documents.$id.tsx` — экран «Проверка входящей заявки»:
  - Слева: вложения (виьюер PDF/изображения через storage signed URL), исходный текст.
  - Справа: форма с распознанными полями (точки загрузки/выгрузки, груз, оплата, контакты, машина/водитель), warnings, селекторы существующих сделки/перевозчика/машины/водителя.
  - Кнопки: «Сохранить черновик», «Привязать к сделке», «Создать задание водителю», «Игнорировать», «Разобрать заново».
- Вкладка в карточке сделки/рейса «Документы от грузовладельца» — список связанных inbound docs.

## 6. Создание рейса

`createTripFromInbound(inboundId, payload)`:
- собирает `dispatcher_trips` (carrier_ext_id, vehicle_ext_id, driver_ext_id, статус `assigned`, груз/оплата/notes/special).
- генерирует упорядоченные `dispatcher_trip_points` (loading → unloading), копирует контакты/время/способ.
- копирует все привязанные вложения в `dispatcher_trip_documents` (storage move/copy).
- ставит `dispatcher_inbound_documents.processing_status='linked'`, проставляет `dispatcher_trip_id`.
- Водитель видит рейс в существующем `/driver` без изменений водительского кабинета.

## 7. UX-сообщения, idempotency, безопасность

- Пользовательские сообщения как в ТЗ (без техники).
- Лог сервера с requestId/carrier/email_message_id/hash/parse warnings.
- Все запросы — только через `requireSupabaseAuth` + проверка роли/принадлежности carrier; никаких `supabaseAdmin` за пределами проверенных handler-ов.
- Идемпотентность создания рейса: уникальный `client_request_id` в trips или проверка по `inbound_document_id`.

## 8. Технические детали

- Зависимости: `bun add imapflow mailparser pdf-parse mammoth` (все Worker-совместимы под `nodejs_compat`).
- `inputValidator` с zod для всех server fn.
- Никаких изменений в `auth-middleware.ts`, `client.ts`, `client.server.ts`, `types.ts` руками (типы перегенерятся миграцией).
- Не трогаем nginx/PM2/DNS/складские маршруты/QR/кассу/orders.

## Что НЕ войдёт в MVP (по ТЗ)

OCR-сервис, акты/счета, ЭДО, подпись, оплата, ATI, AI-поиск грузов, редизайн. Сканы → `needs_review` с понятным сообщением.

## Проверка

- `tsc --noEmit` и `npm run build` после каждого шага.
- Ручная проверка на radius-track.ru после деплоя (не считается готовым на preview).

## Подтверждение

Объём ≈ 15–20 файлов + 1 миграция + 4 новых npm-пакета. Делать в одну итерацию или разбить на 2 PR (1: БД+парсер+IMAP+carrier-кнопка; 2: dispatcher UI + create-trip)?

# MVP: Предложения рейсов + отправка грузовладельцу с почты перевозчика

Большой, но цельный этап. Делю на 4 блока, каждый — атомарная единица.

## Блок 1. SMTP-почта перевозчика

**Новые файлы**
- `supabase/migrations/*_carrier_email.sql` — таблица `dispatcher_carrier_email_accounts`:
  `id, carrier_ext_id (FK), email, from_name, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_encrypted, ati_email, is_verified, is_active, last_test_at, last_error, created_at, updated_at`.
  GRANT authenticated/service_role. RLS: owner перевозчика SELECT/INSERT/UPDATE (через carrier_ext → auth.uid). **Колонка `smtp_password_encrypted` исключена из SELECT для роли карриера через view**: создаю view `dispatcher_carrier_email_accounts_safe` без пароля, фронт читает из view, пишет в таблицу.
- `src/lib/email/crypto.server.ts` — AES-256-GCM шифрование с `EMAIL_ENCRYPTION_KEY`. Если ключа нет — throw понятная ошибка.
- `src/lib/email/smtp.server.ts` — отправка через nodemailer (Worker-совместимая альтернатива: используем `nodemailer` через nodejs_compat; если не запустится — `smtp-client` fallback). На всякий случай возьму `nodemailer` — он работает в workerd с nodejs_compat.
- `src/lib/server-functions/carrier-email.functions.ts` — `getEmailAccount`, `saveEmailAccount`, `testEmailAccount` (с `requireSupabaseAuth`). Никогда не возвращает пароль.
- `src/routes/carrier.email-settings.tsx` — форма с полями + кнопка «Проверить почту». Статусы: не подключена / не проверена / проверена / ошибка.

**Edit**
- `src/routes/carrier.index.tsx` — баннер «Подключите почту…» если аккаунта нет.

**Secret**: попрошу пользователя добавить `EMAIL_ENCRYPTION_KEY` (32 байта hex/base64) через secrets tool.

## Блок 2. Предложение рейса (offer)

**Миграция** — `dispatcher_carrier_offers`:
`id, freight_id, vehicle_ext_id, carrier_ext_id, driver_ext_id, dispatcher_id, offer_status (enum), source_text, parsed_payload jsonb, shipper_company, shipper_contact_name, shipper_phone, shipper_email, rate_amount numeric, rate_vat_mode, payment_terms, sent_at, viewed_at, responded_at, response_comment, created_at, updated_at`.
Enum: `draft|sent_to_carrier|viewed_by_carrier|accepted_by_carrier|declined_by_carrier|cancelled|expired`.
GRANT + RLS: диспетчер видит все (через has_role), перевозчик — только свои (carrier_ext.owner_user_id = auth.uid).

**API (server functions)** в `src/lib/server-functions/carrier-offers.functions.ts`:
- `createOffer` (dispatcher) — из формы «Собрать предложение рейса».
- `sendOfferToCarrier` (dispatcher) — статус → sent_to_carrier, sent_at.
- `listCarrierOffers` (carrier) — для входящих.
- `markOfferViewed` (carrier).
- `acceptOffer` (carrier) → accepted_by_carrier + emit notification для диспетчера.
- `declineOffer` (carrier) с причиной.

**UI**
- Edit `src/components/dispatcher/BuildOfferDialog.tsx` — добавить кнопку «Отправить перевозчику» рядом с «Собрать». Использовать существующий парсер `freight-parse.ts` для shipper_*.
- Новый `src/routes/carrier.requests.tsx` — список входящих предложений + карточка с «Взять рейс / Отказаться».

## Блок 3. Громкие уведомления

**Новые**
- `src/lib/notifications/loud-ring.ts` — singleton: запускает HTMLAudioElement в loop, кнопка «Отключить». Базовый звук — генерируем через WebAudio (короткий beep loop), не нужен бинарь. Учитываем autoplay-policy: при первом клике в кабинете «armed».
- `src/components/IncomingOfferToast.tsx` — модалка/баннер с loud-ring при появлении новой записи через realtime.
- `src/hooks/use-incoming-offers.ts` — подписка на supabase realtime по `dispatcher_carrier_offers` фильтр `carrier_ext_id`.
- Аналогично для диспетчера: `use-offer-responses.ts` — слышит accepted/declined.

**Edit**
- `src/routes/carrier.tsx` — монтирует `IncomingOfferToast`.
- `src/routes/dispatcher.tsx` (или layout) — слушатель ответов перевозчика.

## Блок 4. Отправка письма грузовладельцу

**Миграция** — `dispatcher_email_messages`:
`id, carrier_ext_id, offer_id, freight_id, deal_id, from_email, from_name, to_emails text[], cc_emails text[], subject, body, status (draft|sent|failed), provider text default 'carrier_smtp', error_message, sent_at, created_by uuid, created_at`.
RLS: диспетчер всё, перевозчик — свои.

**API** `src/lib/server-functions/shipper-email.functions.ts`:
- `prepareShipperEmail(offerId)` — собирает шаблон с подстановками.
- `sendShipperEmail(offerId, { to, cc, subject, body })` — диспетчер; сервер вытаскивает carrier SMTP-аккаунт, отправляет через nodemailer, пишет в `dispatcher_email_messages`. Идемпотентность: уникальный `client_request_id`, чтоб двойной клик не дублировал.

**UI**
- В карточке принятого offer у диспетчера — кнопка «Отправить данные грузовладельцу» → модалка с предзаполненным шаблоном (см. ТЗ).
- Статус почты перевозчика в карточке: «Почта подключена / не подключена / не проверена».
- В карточке offer/deal — таб «История»: события из offer полей + строки `dispatcher_email_messages`.

## Технические замечания

- **nodemailer в workerd**: проверю; если падает — переключусь на raw SMTP через `node:net + node:tls` (минимальный клиент, ~150 строк). Не блокатор.
- **realtime**: уже включён для других таблиц, проверю `supabase/config.toml` и добавлю публикацию для новых таблиц в миграции (`alter publication supabase_realtime add table ...`).
- **types.ts регенерируется** после миграции.
- **routeTree.gen.ts** обновится автоматически на dev-сервере, не редактирую вручную.

## Вне scope
ATI API, AI-поиск, счета/акты, телефония, WhatsApp/Max автоотправка (только кнопки-deeplinks), массовые рассылки, редизайн.

## Порядок выполнения
1. Спросить про `EMAIL_ENCRYPTION_KEY` (secret).
2. Миграция 1 (email accounts) + миграция 2 (offers + messages + realtime publication) — двумя вызовами migration tool подряд.
3. После approve миграций: server functions, UI карриера (email settings + requests), UI диспетчера (send offer + send shipper email), realtime toasts со звуком.
4. Проверка через preview, отчёт.

## Файлы (оценка)
- Новых: ~14 (2 миграции, 4 server functions, 3 route, 4 component/hook, 1 crypto helper)
- Edit: ~5 (carrier.index, carrier.tsx, dispatcher layout, BuildOfferDialog, plan.md)

## Production проверка
- /carrier/email-settings: ввести SMTP Яндекса/Mail.ru с app-password, нажать «Проверить» — письмо приходит.
- Диспетчер: собрать offer → отправить → на втором браузере карриер слышит звонок → принимает.
- Диспетчер слышит «принято» → отправляет письмо грузовладельцу → письмо реально приходит с адреса перевозчика, Reply-To корректный.
- Двойной клик — один email в журнале.
- tsc --noEmit и npm run build зелёные.

Готов начать с запроса `EMAIL_ENCRYPTION_KEY` и первой миграции?

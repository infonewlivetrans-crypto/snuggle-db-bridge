
# Driver cabinet for AI-dispatcher trips (MVP)

Reuse what's already in `src/routes/driver.*` + `src/components/Driver*`. Don't fork or rewrite the old delivery_routes flow. Add a parallel, lightweight "dispatcher trip" view that lives alongside it.

## What I will reuse (no rewrite)
- `src/routes/driver.index.tsx` — extend list with a second section "Рейсы AI-диспетчера".
- `src/routes/driver.vehicle.tsx`, `driver.register.$token.tsx` — untouched.
- `src/components/DriverOrderCard.tsx`, `DriverGeoTracker`, `DeliveryPointsBlock`, photo/file upload utils (`src/lib/uploads.ts`, `offlinePhotoStore`) — reused inside the new trip page where applicable.
- Existing auth/RLS via `requireSupabaseAuth` + `apiGetAuth/apiPostAuth`.
- `src/lib/units.ts`, `vehicle-readiness.ts` already in place.

## Data model — one new table, no churn on old logistics

Migration `dispatcher_trips` + `dispatcher_trip_points` + `dispatcher_trip_events`:
- `dispatcher_trips`: `id`, `deal_id` (nullable fk → dispatcher_deals), `carrier_ext_id`, `vehicle_ext_id`, `driver_ext_id`, `status` enum (`assigned`,`to_pickup`,`at_pickup`,`loaded`,`to_dropoff`,`at_dropoff`,`unloaded`,`delivered`,`cancelled`), `current_point_idx`, `comment`, `rate_visible_to_driver`, timestamps.
- `dispatcher_trip_points`: `id`, `trip_id`, `idx`, `kind` (`pickup`|`dropoff`|`waypoint`), `city`, `address`, `lat`, `lng`, `contact_name`, `contact_phone`, `scheduled_at`, `comment`, `status` (`pending`|`arrived`|`done`), `arrived_at`, `done_at`.
- `dispatcher_trip_events`: `id`, `trip_id`, `point_id` nullable, `event`, `payload jsonb`, `at`, `actor_user_id`.
- File attachments reuse existing storage via a `dispatcher_trip_documents` table (`trip_id`, `point_id` nullable, `kind`, `storage_path`, `required boolean default false`).

All four tables: GRANT to authenticated + service_role, RLS:
- driver may SELECT trips where `driver_ext.user_id = auth.uid()`;
- driver may UPDATE only own trip status + point status + insert events/docs;
- carrier owner may SELECT trips of own carrier_ext; dispatcher (has_role) all.

## API (server functions + 1 server route)
All under `src/lib/server-functions/driver-trips.functions.ts` with `requireSupabaseAuth`:
- `listDriverTrips()` → active + recent for current user's driver_ext.
- `getDriverTrip({ tripId })` → trip + points + docs + events.
- `advanceTripStatus({ tripId, next })` → validates legal transition, updates trip + current point status, writes event, on `delivered` flips `dispatcher_vehicle_ext.status` → `ready_to_work` and `dispatcher_driver_ext.status` → `ready_to_work` (only if they were busy on this trip).
- `uploadTripDocument({ tripId, pointId?, kind, storagePath })` — records row; file upload uses existing storage helpers.
- `createTripFromDeal({ dealId })` — dispatcher-only (has_role check), seeds points from deal/freight `loading_city`/`unloading_city`/addons; used by existing "назначить рейс" flow.

No service-role usage. No edge functions.

## UI

### `src/routes/driver.index.tsx`
Add a section above old routes:
- "Активный рейс" card (if any trip not in `delivered`/`cancelled`): route from → to, points count, cargo summary, big primary CTA "Открыть задание".
- "История рейсов" collapsed list.
- Existing "Мои маршруты" (старая логистика) section is kept below, only rendered if there are old routes — header changes to "Складские маршруты".
- Empty state when neither: "Пока нет активных заданий…".

### New `src/routes/driver.trip.$tripId.tsx`
Mobile-first, sectioned, sticky bottom action bar with `pb-[env(safe-area-inset-bottom)]`:
1. Header — номер, статус-чип, откуда → куда.
2. **Маршрут** — ordered list of points with kind icon (загрузка/выгрузка), city/address, time, contact (tap to call), comment, point status. "Открыть в навигаторе" → `yandexnavi://`/`geo:` fallback.
3. **Груз** — weight (kg → tons via `formatTons`), volume, body type, comment.
4. **Контакты** — диспетчер + контакты точек.
5. **Документы** — upload buttons grouped by kind; required marked with red asterisk; optional otherwise; reuse `src/lib/uploads.ts`.
6. **История статусов** — events list.
7. Sticky CTA — next-action button per `nextActionFor(status, currentPointKind)`:
   - assigned → "Поехал на загрузку"
   - to_pickup → "Я на загрузке"
   - at_pickup → "Загрузился" (advances point; if more pickups → back to to_pickup for next)
   - loaded → "Поехал на выгрузку"
   - to_dropoff → "Я на выгрузке"
   - at_dropoff → "Выгрузился"
   - unloaded (more dropoffs) → "Поехал на следующую выгрузку"
   - last unload → "Сдал груз / завершить рейс"
   - delivered → no CTA, banner "Рейс завершён".

Errors render friendly Russian strings ("Не удалось…"), real error goes to console + server log.

### Hiding old-logistics blocks for dispatcher trips
The new trip page is a separate route — old `driver.$deliveryRouteId.tsx` is not touched, so cash/QR/warehouse/return blocks never render here. The old route stays for складская логистика as-is.

### Owner-driver
`/carrier/drivers` already has "Я сам водитель" (idempotent — looks up by `user_id` first). Add a small banner on `/carrier` if `is_owner_driver=true`: "У вас есть доступ к водительскому кабинету →" link to `/driver`.

## Status flips
`advanceTripStatus` to `delivered`:
- `update dispatcher_vehicle_ext set status='ready_to_work', updated_at=now() where id=$vehicle and assigned_driver_ext_id=$driver` — uses existing allowed status value (already in CHECK list).
- `update dispatcher_driver_ext set status='ready_to_work' where id=$driver and user_id=auth.uid()`.
- If `deal_id` set, update `dispatcher_deals.deal_status='delivered'`, `delivered_at=now()`.

I'll first read the existing CHECK on both `status` columns and reuse one of the allowed free values (`ready_to_work` / `free` / `available`) — whichever already exists.

## Out of scope (explicitly NOT doing)
ATI parsing, cash, warehouse, returns, QR, kassa, AI freight search, emails/calls/invoices, redesign, nginx/PM2/DNS.

## Files

New:
- `supabase/migrations/<ts>_dispatcher_trips.sql`
- `src/lib/server-functions/driver-trips.functions.ts`
- `src/lib/server-functions/driver-trips.server.ts` (helpers)
- `src/lib/dispatcher/trip-status.ts` (pure transitions + labels)
- `src/routes/driver.trip.$tripId.tsx`
- `src/components/driver/DriverTripCard.tsx`
- `src/components/driver/DriverTripPointList.tsx`
- `src/components/driver/DriverTripDocuments.tsx`
- `src/components/driver/DriverTripActionBar.tsx`

Edited:
- `src/routes/driver.index.tsx` — add dispatcher-trips section, keep old.
- `src/routes/carrier.index.tsx` — owner-driver banner.
- `.lovable/plan.md` — append progress notes.
- `src/integrations/supabase/types.ts` — regenerated after migration.

## What to verify on production (radius-track.ru)
1. Dispatcher assigns a deal to vehicle+driver → trip auto-created → appears in `/driver`.
2. Owner-driver sees same trip in `/driver` after using "Я сам водитель".
3. Multi-pickup + multi-dropoff trip walks through statuses in order.
4. Photo upload to a point works from Max Messenger and Telegram in-app browser.
5. After "Сдал груз", vehicle reappears as free on `/dispatcher/map`.
6. Old `/driver/$deliveryRouteId` warehouse trip still shows cash/QR/warehouse blocks as before.
7. `tsc --noEmit` and `npm run build` pass locally.

Approve and I'll implement in one batch (migration first, then code).

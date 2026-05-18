import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { normalizeRuPhone } from "@/lib/phone";
import {
  resolveManagerForImport,
  type ResolvedManager,
} from "@/server/managers-resolve.server";
import { ensureDefaultCarrierId } from "@/server/carriers.server";
import { geocodeOrderRow } from "@/server/order-geocode.server";
type PaymentKind = "cash" | "qr" | "paid" | "bank" | "unknown";

type IncomingOrder = {
  rowIndex: number;
  orderNumber: string | null;
  orderDate: string | null;
  customer: string | null;
  deliveryAddress: string | null;
  contactPhone: string | null;
  deliveryPeriod?: string | null;
  amountToCollect: number | null;
  paymentRaw: string | null;
  paymentKind: PaymentKind;
  requiresQr: boolean;
  managerName: string | null;
  managerPhone: string | null;
  organization: string | null;
  comment: string | null;
};

type IncomingItem = {
  sourceLine: number;
  lineNumber: number | null;
  nomenclature: string;
  characteristic: string | null;
  quality: string | null;
  unit: string | null;
  qty: number | null;
  weight_kg: number | null;
  volume_m3: number | null;
  comment: string | null;
  raw_text: string;
  needsReview: boolean;
};

type IncomingTransportRequest = {
  requestNumber: string | null;
  requestDate: string | null;
  loadingDate: string | null;
  loadingTime: string | null;
  loadingAddress: string | null;
  unloadingAddress: string | null;
  shipper: string | null;
  consignee: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  cargoDescription: string | null;
  weightKg: number | null;
  volumeM3: number | null;
  placesCount: number | null;
  vehicleRequirements: string | null;
  carrier: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  comment: string | null;
  organization: string | null;
  orderNumbers: string[];
  raw: Record<string, string>;
};

type IncomingPayload = {
  // Маршрутный лист (всё опционально — может прийти только заявка на транспорт)
  routeNumber?: string | null;
  routeDate?: string | null;
  organization?: string | null;
  shipper?: string | null;
  carrier?: string | null;
  contract?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehiclePlate?: string | null;
  orders?: IncomingOrder[];
  /** Опциональный товарный состав: ключ — нормализованный номер заказа. */
  itemsByOrderNumber?: Record<string, IncomingItem[]>;
  /** Опциональная шапка из файла «Заявка на транспорт». */
  transportRequest?: IncomingTransportRequest | null;
};

function buildTransportComment(
  tr: IncomingTransportRequest,
  unrecognized: string[],
): string {
  const lines: string[] = [];
  const push = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      lines.push(`${label}: ${value}`);
    }
  };
  push("Адрес погрузки", tr.loadingAddress);
  push("Адрес выгрузки", tr.unloadingAddress);
  if (tr.loadingDate || tr.loadingTime) {
    push(
      "Погрузка",
      `${tr.loadingDate ?? ""}${tr.loadingTime ? " " + tr.loadingTime : ""}`.trim(),
    );
  }
  push("Грузоотправитель", tr.shipper);
  push("Грузополучатель", tr.consignee);
  push("Контактное лицо", tr.contactPerson);
  push("Телефон", tr.contactPhone);
  push("Груз", tr.cargoDescription);
  push("Вес, кг", tr.weightKg);
  push("Объём, м³", tr.volumeM3);
  push("Мест", tr.placesCount);
  push("Требования к ТС", tr.vehicleRequirements);
  if (tr.orderNumbers.length)
    push("Номера заказов из заявки", tr.orderNumbers.join(", "));
  if (unrecognized.length)
    lines.push(`Не распознано: ${unrecognized.join(", ")}`);
  return lines.join("\n");
}

/**
 * Защитная нормализация значения организации: отсеивает фрагменты
 * договорных условий/штрафов, которые иногда попадают в это поле
 * при импорте из 1С.
 */
function sanitizeOrganizationValue(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > 160) return null;
  const banned = /(штраф|сутки|просто[яй]|уплачив|обязуется|неустойк|пеня|пени|ответствен|сверхнормат|претензи|расторж|настоящ(его|ему)|договор|услов|порядок|оплат[аы]|тариф|нормат)/i;
  if (banned.test(s)) return null;
  if (/[.!?]\s+[А-ЯЁA-Z]/.test(s)) return null;
  if (s.split(/\s+/).length > 10) return null;
  return s;
}

function paymentToDb(
  kind: PaymentKind,
): "cash" | "qr" | "online" | "card" | "bank_transfer" {
  if (kind === "qr") return "qr";
  if (kind === "cash") return "cash";
  if (kind === "paid") return "online";
  if (kind === "bank") return "bank_transfer";
  return "cash";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function suffixOrderNumber(base: string | null, idx: number): string {
  if (base && base.trim()) return base.trim();
  return `RL-${Date.now().toString().slice(-6)}-${idx + 1}`;
}

const ADDRESS_PLACEHOLDER = "Требует заполнения";

type ImportedRow = {
  rowIndex: number;
  orderId: string | null;
  orderNumber: string;
  customer: string | null;
  missingFields: string[];
  reason?: string;
};

export const Route = createFileRoute("/api/import-route-sheet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const authUserId = auth.userId;

        let payload: IncomingPayload;
        try {
          payload = (await request.json()) as IncomingPayload;
        } catch {
          return jsonResponse(
            { error: "Не удалось прочитать данные импорта" },
            { status: 400 },
          );
        }

        const tr = payload.transportRequest ?? null;
        const hasTr = !!tr;
        const rsOrdersIn = Array.isArray(payload.orders) ? payload.orders : [];
        const hasRsOrders = rsOrdersIn.length > 0;

        if (!hasTr && !hasRsOrders) {
          return jsonResponse(
            {
              error:
                "Импорт пуст: нет ни заявки на транспорт, ни маршрутного листа с заказами",
            },
            { status: 400 },
          );
        }

        // Объединение шапки: TR имеет приоритет для шапки/источника,
        // routeSheet — для операционных полей (carrier/driver/vehicle берём
        // прежде всего из RS, если в нём указаны).
        const mergedRouteNumber =
          payload.routeNumber?.trim() ||
          tr?.requestNumber?.trim() ||
          null;
        const mergedRouteDate =
          payload.routeDate ||
          tr?.loadingDate ||
          tr?.requestDate ||
          null;
        const mergedOrganization =
          sanitizeOrganizationValue(payload.organization) ??
          sanitizeOrganizationValue(tr?.organization ?? null);
        const mergedCarrier = payload.carrier ?? tr?.carrier ?? null;
        const mergedDriverName = payload.driverName ?? tr?.driverName ?? null;
        const mergedDriverPhone = payload.driverPhone ?? tr?.driverPhone ?? null;
        const mergedVehiclePlate = payload.vehiclePlate ?? tr?.vehiclePlate ?? null;
        const mergedContract = payload.contract ?? null;

        // Перезаписываем payload-подобный объект, дальше код работает с ним.
        const effective = {
          routeNumber: mergedRouteNumber,
          routeDate: mergedRouteDate,
          organization: mergedOrganization,
          carrier: mergedCarrier,
          driverName: mergedDriverName,
          driverPhone: mergedDriverPhone,
          vehiclePlate: mergedVehiclePlate,
          contract: mergedContract,
        };

        const warnings: string[] = [];
        const headerMissing: string[] = [];
        if (!effective.routeNumber) headerMissing.push("Номер маршрутного листа");
        if (!effective.routeDate) headerMissing.push("Дата");
        if (!effective.carrier) headerMissing.push("Перевозчик");
        if (!effective.driverName) headerMissing.push("Водитель");
        if (!effective.driverPhone) headerMissing.push("Телефон водителя");
        if (!effective.vehiclePlate) headerMissing.push("Номер ТС");
        if (!effective.contract && !hasTr) headerMissing.push("Договор");

        // Если есть только заявка на транспорт без маршрутного листа —
        // синтезируем orders из orderNumbers (или один синтетический).
        // Эти заказы пройдут стандартный путь создания orders + route_points.
        const synthesizedFromTr = !hasRsOrders && hasTr;
        if (synthesizedFromTr) {
          const keys: Array<string | null> =
            tr!.orderNumbers.length > 0 ? [...tr!.orderNumbers] : [null];
          rsOrdersIn.push(
            ...keys.map<IncomingOrder>((k, idx) => ({
              rowIndex: idx + 1,
              orderNumber: k,
              orderDate: tr!.requestDate,
              customer: tr!.consignee ?? tr!.contactPerson ?? null,
              deliveryAddress: tr!.unloadingAddress,
              contactPhone: tr!.contactPhone,
              deliveryPeriod: tr!.loadingTime,
              amountToCollect: null,
              paymentRaw: null,
              paymentKind: "unknown",
              requiresQr: false,
              managerName: null,
              managerPhone: null,
              organization: tr!.organization,
              comment: [
                tr!.cargoDescription ? `Груз: ${tr!.cargoDescription}` : null,
                tr!.comment,
              ]
                .filter(Boolean)
                .join(" · ") || null,
            })),
          );
          if (keys.length > 1 && tr!.unloadingAddress) {
            warnings.push(
              "Адрес выгрузки общий для всех заказов — проверьте точки для каждого заказа.",
            );
          }
          if (!tr!.unloadingAddress) {
            warnings.push(
              "Адрес доставки не найден в заявке — заказы созданы с пометкой «Требует заполнения».",
            );
          }
        }

        // Перетягиваем именованные алиасы старой логики — она ниже читает payload.*
        payload.routeNumber = effective.routeNumber;
        payload.routeDate = effective.routeDate;
        payload.organization = effective.organization;
        payload.carrier = effective.carrier;
        payload.driverName = effective.driverName;
        payload.driverPhone = effective.driverPhone;
        payload.vehiclePlate = effective.vehiclePlate;
        payload.contract = effective.contract;
        payload.orders = rsOrdersIn;

        // 1. Перевозчик (тихий upsert)
        let carrierId: string | null = null;
        if (payload.carrier) {
          try {
            const { data: existing } = await sb
              .from("carriers")
              .select("id")
              .ilike("company_name", payload.carrier)
              .maybeSingle();
            if (existing) {
              carrierId = (existing as { id: string }).id;
            } else {
              const { data: created, error: cErr } = await sb
                .from("carriers")
                .insert({
                  company_name: payload.carrier,
                  carrier_type: "self_employed",
                  source: "route_sheet",
                } as never)
                .select("id")
                .single();
              if (cErr) warnings.push(`Перевозчик: ${cErr.message}`);
              else if (created) carrierId = (created as { id: string }).id;
            }
          } catch (e) {
            warnings.push(
              `Перевозчик: ${e instanceof Error ? e.message : "ошибка"}`,
            );
          }
        }

        // Фоллбек: если перевозчик не указан или не удалось создать —
        // используем «Без перевозчика». Импорт не блокируем.
        if (!carrierId) {
          try {
            carrierId = await ensureDefaultCarrierId();
            warnings.push(
              payload.carrier
                ? `Перевозчик «${payload.carrier}» не создан — использован «Без перевозчика», можно изменить вручную.`
                : `Перевозчик в маршрутном листе не указан — использован «Без перевозчика», можно изменить вручную.`,
            );
          } catch (e) {
            warnings.push(
              `Перевозчик: не удалось получить fallback (${e instanceof Error ? e.message : "ошибка"})`,
            );
          }
        }

        // 2. Водитель (после того, как carrierId гарантированно есть)
        let driverId: string | null = null;
        if (payload.driverName && carrierId) {
          try {
            const { data: existingDr } = await sb
              .from("drivers")
              .select("id")
              .eq("carrier_id", carrierId)
              .ilike("full_name", payload.driverName)
              .maybeSingle();
            if (existingDr) {
              driverId = (existingDr as { id: string }).id;
              if (payload.driverPhone) {
                await sb
                  .from("drivers")
                  .update({
                    phone:
                      normalizeRuPhone(payload.driverPhone) ?? payload.driverPhone,
                  } as never)
                  .eq("id", driverId);
              }
            } else {
              const { data: createdDr, error: dErr } = await sb
                .from("drivers")
                .insert({
                  carrier_id: carrierId,
                  full_name: payload.driverName,
                  phone: payload.driverPhone
                    ? (normalizeRuPhone(payload.driverPhone) ??
                      payload.driverPhone)
                    : null,
                } as never)
                .select("id")
                .single();
              if (dErr) warnings.push(`Водитель: ${dErr.message}`);
              else if (createdDr) driverId = (createdDr as { id: string }).id;
            }
          } catch (e) {
            warnings.push(
              `Водитель: ${e instanceof Error ? e.message : "ошибка"}`,
            );
          }
        }
        if (!driverId) {
          warnings.push("Водитель не найден, можно назначить вручную.");
        }

        // 3. ТС (после того, как carrierId гарантированно есть)
        let vehicleId: string | null = null;
        if (payload.vehiclePlate && carrierId) {
          try {
            const plate = payload.vehiclePlate.trim();
            const { data: existingVh } = await sb
              .from("vehicles")
              .select("id")
              .eq("carrier_id", carrierId)
              .ilike("plate_number", plate)
              .maybeSingle();
            if (existingVh) {
              vehicleId = (existingVh as { id: string }).id;
            } else {
              const { data: createdVh, error: vErr } = await sb
                .from("vehicles")
                .insert({
                  carrier_id: carrierId,
                  plate_number: plate,
                  body_type: "tent",
                } as never)
                .select("id")
                .single();
              if (vErr) warnings.push(`ТС: ${vErr.message}`);
              else if (createdVh) vehicleId = (createdVh as { id: string }).id;
            }
          } catch (e) {
            warnings.push(`ТС: ${e instanceof Error ? e.message : "ошибка"}`);
          }
        }
        if (!vehicleId) {
          warnings.push("Авто не найдено, можно назначить вручную.");
        }

        // 3a. default_geocode_region из system_settings (для геокодера).
        let defaultRegion: string | null = null;
        try {
          const { data: ds } = await sb
            .from("system_settings")
            .select("setting_value")
            .eq("setting_key", "default_geocode_region")
            .maybeSingle();
          const v = ds?.setting_value;
          defaultRegion =
            typeof v === "string"
              ? v
              : v && typeof v === "object" && "value" in (v as Record<string, unknown>) &&
                  typeof (v as Record<string, unknown>).value === "string"
                ? ((v as Record<string, unknown>).value as string)
                : null;
        } catch {
          defaultRegion = null;
        }
        // Бюджет геокодирования: максимум 50 адресов на один импорт.
        let geocodeBudget = 50;

        // 4. Маршрут — ВСЕГДА создаём как черновик
        const routeNumber =
          payload.routeNumber?.trim() ||
          (hasTr
            ? `TR-${Date.now().toString().slice(-8)}`
            : `RL-${Date.now().toString().slice(-8)}`);
        const routeDate = payload.routeDate || todayIso();

        // Дополнительные поля шапки, если пришла заявка на транспорт.
        const trUnrecognized: string[] = [];
        if (hasTr) {
          if (!tr!.loadingDate) trUnrecognized.push("дата погрузки");
          if (!tr!.loadingAddress) trUnrecognized.push("адрес погрузки");
          if (!tr!.unloadingAddress) trUnrecognized.push("адрес выгрузки");
          if (!tr!.cargoDescription) trUnrecognized.push("описание груза");
          if (!tr!.contactPhone) trUnrecognized.push("контактный телефон");
        }
        const transportCommentText = hasTr
          ? buildTransportComment(tr!, trUnrecognized)
          : null;
        // Пользовательский комментарий из исходной заявки (если в TR есть
        // поле «Комментарий/Примечание»). НЕ дамп всех распознанных полей —
        // дамп оставляем только в transport_comment в человекочитаемом виде.
        const userCommentText = hasTr ? (tr!.comment?.trim() || null) : null;
        const headerNoteParts = [
          headerMissing.length
            ? `Требует заполнения: ${headerMissing.join(", ")}`
            : null,
          trUnrecognized.length
            ? `Требует проверки: ${trUnrecognized.join(", ")}`
            : null,
        ].filter(Boolean) as string[];
        const headerNote = headerNoteParts.length
          ? headerNoteParts.join(" · ")
          : null;

        // Склад погрузки — нестрогий поиск по имени/адресу (только при TR)
        let warehouseId: string | null = null;
        if (hasTr && tr!.loadingAddress) {
          try {
            const slice = tr!.loadingAddress.slice(0, 40);
            const { data: wh } = await sb
              .from("warehouses")
              .select("id")
              .or(`name.ilike.%${slice}%,address.ilike.%${slice}%`)
              .limit(1)
              .maybeSingle();
            if (wh) warehouseId = (wh as { id: string }).id;
          } catch {
            /* не критично */
          }
        }

        const plannedDepartureAt =
          hasTr && tr!.loadingDate && tr!.loadingTime
            ? `${tr!.loadingDate}T${tr!.loadingTime}:00`
            : null;
        const departureTime = hasTr ? tr!.loadingTime : null;
        const initWeight = hasTr ? (tr!.weightKg ?? 0) : 0;
        const initVolume = hasTr ? (tr!.volumeM3 ?? 0) : 0;
        const onecRequestNumber = hasTr
          ? (tr!.requestNumber ?? payload.routeNumber ?? null)
          : payload.routeNumber;
        const routeSource: "route_sheet" | "transport_request" = hasTr
          ? "transport_request"
          : "route_sheet";

        // 4a. Идемпотентность: ищем существующий route по onec_request_number
        // (если есть TR) ИЛИ по route_number.
        let routeId: string | null = null;
        async function findExisting() {
          if (hasTr && tr!.requestNumber) {
            const { data } = await sb
              .from("routes")
              .select("id, route_number")
              .eq("onec_request_number", tr!.requestNumber)
              .maybeSingle();
            if (data) return data as { id: string; route_number: string };
          }
          if (payload.routeNumber?.trim()) {
            const { data } = await sb
              .from("routes")
              .select("id, route_number")
              .eq("route_number", routeNumber)
              .maybeSingle();
            if (data) return data as { id: string; route_number: string };
          }
          return null;
        }
        const existingRoute = await findExisting();
        if (existingRoute) {
          const existingId = existingRoute.id;
          const { count: pointsCount } = await sb
            .from("route_points")
            .select("id", { count: "exact", head: true })
            .eq("route_id", existingId);
          if ((pointsCount ?? 0) > 0) {
            return jsonResponse(
              {
                error: `Заявка №${existingRoute.route_number} уже создана`,
                code: hasTr
                  ? "transport_request_already_imported"
                  : "route_already_imported",
                routeId: existingId,
                routeNumber: existingRoute.route_number,
              },
              { status: 409 },
            );
          }
          routeId = existingId;
          warnings.push(
            `Найден незавершённый импорт №${existingRoute.route_number} — продолжаем дозапись.`,
          );
        }

        if (!routeId) {
          const { data: route, error: rErr } = await sb
            .from("routes")
            .insert({
              route_number: routeNumber,
              route_date: routeDate,
              request_type: "client_delivery",
              status: "planned",
              request_status: "draft",
              source: routeSource,
              organization: mergedOrganization,
              onec_request_number: onecRequestNumber,
              carrier_id: carrierId,
              driver_id: driverId,
              vehicle_id: vehicleId,
              warehouse_id: warehouseId,
              driver_name: payload.driverName,
              departure_time: departureTime,
              planned_departure_at: plannedDepartureAt,
              total_weight_kg: initWeight,
              total_volume_m3: initVolume,
              transport_comment: transportCommentText || headerNote,
              comment: userCommentText,
              request_status_comment: headerNote,
            } as never)
            .select("id")
            .single();

          if (rErr || !route) {
            console.error("[import-route-sheet] routes.insert failed (full error):", rErr);
            // Гонка по уникальному индексу — отдаём 409, а не 500
            if (rErr?.code === "23505") {
              return jsonResponse(
                {
                  error: `Заявка №${routeNumber} уже создана`,
                  code: hasTr
                    ? "transport_request_already_imported"
                    : "route_already_imported",
                  routeNumber,
                },
                { status: 409 },
              );
            }
            return jsonResponse(
              {
                error: `Не удалось создать заявку: ${rErr?.message ?? "неизвестная ошибка"}`,
                message: rErr?.message,
                details: rErr?.details,
                hint: rErr?.hint,
                code: rErr?.code,
              },
              { status: 500 },
            );
          }
          routeId = (route as { id: string }).id;
        }

        // 5. Заказы + клиенты + точки
        const importedRows: ImportedRow[] = [];
        const failedRows: Array<{ rowIndex: number; reason: string }> = [];
        const clientsNeedingFill = new Map<
          string,
          { name: string; clientId: string | null; missing: Set<string> }
        >();
        // Кэш менеджеров на время одного импорта: ключ = нормализованное ФИО (lowercase).
        // Предотвращает повторные запросы и параллельное создание дубликатов.
        const managerCache = new Map<string, ResolvedManager | null>();
        async function resolveManagerCached(
          name: string | null | undefined,
          phone: string | null | undefined,
        ): Promise<ResolvedManager | null> {
          const key = (name ?? "").trim().toLowerCase();
          if (!key) return null;
          if (managerCache.has(key)) return managerCache.get(key) ?? null;
          try {
            const r = await resolveManagerForImport({
              sb,
              rawName: name,
              rawPhone: phone,
              userId: authUserId,
            });
            managerCache.set(key, r);
            return r;
          } catch (e) {
            warnings.push(
              `Менеджер «${name}»: ${e instanceof Error ? e.message : "ошибка"}`,
            );
            managerCache.set(key, null);
            return null;
          }
        }
        let inserted = 0;
        let pointNumber = 1;

        for (let i = 0; i < payload.orders.length; i++) {
          const o = payload.orders[i];
          const missing: string[] = [];
          try {
            const orderNumber = suffixOrderNumber(o.orderNumber, i);
            const phoneNorm = o.contactPhone
              ? (normalizeRuPhone(o.contactPhone) ?? o.contactPhone)
              : null;

            // === Клиент: ищем по имени или телефону ===
            type ClientRow = {
              id: string;
              name: string;
              phone: string | null;
              address: string | null;
              client_type: string | null;
              works_weekends: boolean;
              access_notes: string | null;
              unloading_notes: string | null;
              preferred_delivery_time: string | null;
              driver_instructions: string | null;
              extra_attrs: Record<string, unknown> | null;
            };
            const CLIENT_COLS =
              "id, name, phone, address, client_type, works_weekends, access_notes, unloading_notes, preferred_delivery_time, driver_instructions, extra_attrs";
            let clientRow: ClientRow | null = null;

            if (o.customer) {
              const { data: byName } = await sb
                .from("clients")
                .select(CLIENT_COLS)
                .ilike("name", o.customer)
                .maybeSingle();
              if (byName) clientRow = byName as unknown as ClientRow;
            }
            if (!clientRow && phoneNorm) {
              const { data: byPhone } = await sb
                .from("clients")
                .select(CLIENT_COLS)
                .eq("phone", phoneNorm)
                .maybeSingle();
              if (byPhone) clientRow = byPhone as unknown as ClientRow;
            }

            // Создать клиента если не найден
            if (!clientRow && o.customer) {
              const { data: createdCl, error: clErr } = await sb
                .from("clients")
                .insert({
                  name: o.customer,
                  phone: phoneNorm,
                  address: o.deliveryAddress,
                  source: "route_sheet",
                } as never)
                .select(CLIENT_COLS)
                .single();
              if (!clErr && createdCl)
                clientRow = createdCl as unknown as ClientRow;
            }

            // Автоподстановка из справочника
            const finalAddress =
              o.deliveryAddress?.trim() || clientRow?.address || null;
            const finalPhone = phoneNorm || clientRow?.phone || null;
            const defaultsExtra =
              (clientRow?.extra_attrs as { default_payment_type?: string } | null) ?? null;
            const defaultPaymentType = defaultsExtra?.default_payment_type as
              | "cash"
              | "qr"
              | "online"
              | "card"
              | "bank_transfer"
              | undefined;
            const paymentType =
              o.paymentKind === "unknown" && defaultPaymentType
                ? defaultPaymentType
                : paymentToDb(o.paymentKind);
            const requiresQr =
              o.requiresQr ||
              o.paymentKind === "qr" ||
              defaultPaymentType === "qr";

            // Список недостающих полей по строке (не блокируем импорт)
            if (!o.customer) missing.push("Покупатель");
            if (!finalAddress) missing.push("Адрес доставки");
            if (!finalPhone) missing.push("Телефон получателя");
            if (o.paymentKind === "unknown" && !defaultPaymentType)
              missing.push("Тип оплаты");
            if (!o.orderNumber) missing.push("Номер заказа");

            // Менеджер из маршрутного листа: ищем существующего по
            // нормализованному ФИО, иначе создаём и сразу выпускаем invite.
            const managerResolved = await resolveManagerCached(
              o.managerName,
              o.managerPhone,
            );
            if (!managerResolved && o.managerName) {
              missing.push("Менеджер");
            }

            // Геокодирование адреса (если есть реальный адрес и есть бюджет).
            let geoLat: number | null = null;
            let geoLng: number | null = null;
            if (
              finalAddress &&
              finalAddress !== ADDRESS_PLACEHOLDER &&
              geocodeBudget > 0
            ) {
              geocodeBudget--;
              try {
                const outcome = await geocodeOrderRow(sb, finalAddress, {
                  clientAddress: clientRow?.address ?? null,
                  defaultRegion: defaultRegion ?? "Краснодарский край",
                });
                if (outcome) {
                  geoLat = outcome.lat;
                  geoLng = outcome.lng;
                }
              } catch (e) {
                warnings.push(
                  `Геокодер (стр. ${o.rowIndex}): ${e instanceof Error ? e.message : "ошибка"}`,
                );
              }
            }

            const orderPayload = {
              order_number: orderNumber,
              onec_order_number: o.orderNumber,
              contact_name: o.customer,
              contact_phone: finalPhone,
              // Триггер требует адрес ИЛИ координаты — ставим placeholder.
              delivery_address: finalAddress ?? ADDRESS_PLACEHOLDER,
              latitude: geoLat,
              longitude: geoLng,
              payment_type: paymentType,
              requires_qr: requiresQr,
              amount_due:
                o.paymentKind === "cash" ? o.amountToCollect : null,
              goods_amount: o.amountToCollect,
              client_works_weekends: clientRow?.works_weekends ?? false,
              client_type: (clientRow?.client_type as never) ?? null,
              delivery_time_comment:
                o.deliveryPeriod ?? clientRow?.preferred_delivery_time ?? null,
              access_instructions:
                clientRow?.access_notes ?? null,
              manager_id: managerResolved?.id ?? null,
              manager_name: managerResolved?.fullName ?? o.managerName ?? null,
              client_id: clientRow?.id ?? null,
              comment: [
                o.comment,
                o.paymentRaw ? `Оплата: ${o.paymentRaw}` : null,
                clientRow?.unloading_notes
                  ? `Выгрузка: ${clientRow.unloading_notes}`
                  : null,
                clientRow?.driver_instructions
                  ? `Водителю: ${clientRow.driver_instructions}`
                  : null,
                missing.length
                  ? `⚠ Требует заполнения: ${missing.join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || null,
              source: "route_sheet",
            };

            const { data: ord, error: oErr } = await sb
              .from("orders")
              .insert(orderPayload as never)
              .select("id")
              .single();

            if (oErr || !ord) {
              console.error("[import-route-sheet] orders.insert failed (full error):", {
                rowIndex: o.rowIndex,
                payload: orderPayload,
                error: oErr,
              });
              const reason = [
                oErr?.message,
                oErr?.details ? `details: ${oErr.details}` : null,
                oErr?.hint ? `hint: ${oErr.hint}` : null,
                oErr?.code ? `code: ${oErr.code}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Не удалось создать заказ";
              failedRows.push({ rowIndex: o.rowIndex, reason });
              importedRows.push({
                rowIndex: o.rowIndex,
                orderId: null,
                orderNumber,
                customer: o.customer,
                missingFields: missing,
                reason,
              });
              continue;
            }

            const orderId = (ord as { id: string }).id;

            const { error: pErr } = await sb.from("route_points").insert({
              route_id: routeId,
              order_id: orderId,
              point_number: pointNumber,
            } as never);

            if (pErr) {
              console.error("[import-route-sheet] route_points.insert failed (full error):", {
                rowIndex: o.rowIndex,
                routeId,
                orderId,
                error: pErr,
              });
              const reason = [
                pErr.message,
                pErr.details ? `details: ${pErr.details}` : null,
                pErr.hint ? `hint: ${pErr.hint}` : null,
                pErr.code ? `code: ${pErr.code}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              failedRows.push({ rowIndex: o.rowIndex, reason });
            } else {
              pointNumber++;
              inserted++;
            }

            importedRows.push({
              rowIndex: o.rowIndex,
              orderId,
              orderNumber,
              customer: o.customer,
              missingFields: missing,
            });

            // Копим missing-поля по контрагентам
            if (missing.length && o.customer) {
              const key = (o.customer || "").toLowerCase().trim();
              const entry = clientsNeedingFill.get(key) ?? {
                name: o.customer,
                clientId: clientRow?.id ?? null,
                missing: new Set<string>(),
              };
              for (const m of missing) entry.missing.add(m);
              clientsNeedingFill.set(key, entry);
            }
          } catch (e) {
            const reason =
              e instanceof Error ? e.message : "Неизвестная ошибка";
            failedRows.push({ rowIndex: o.rowIndex, reason });
            importedRows.push({
              rowIndex: o.rowIndex,
              orderId: null,
              orderNumber: suffixOrderNumber(o.orderNumber, i),
              customer: o.customer,
              missingFields: missing,
              reason,
            });
          }
        }

        // 6. Уведомления менеджеру по каждому контрагенту с пробелами
        try {
          for (const { name, clientId, missing } of clientsNeedingFill.values()) {
            const list = Array.from(missing);
            await sb.from("notifications").insert({
              kind: "client_data_missing",
              title: `Заполнить данные по контрагенту: ${name}`,
              body: `Не хватает: ${list.join(", ")}. Добавьте данные в карточку контрагента — при следующих импортах они подставятся автоматически.`,
              route_id: routeId,
              payload: {
                recipients: ["manager"],
                client_id: clientId,
                client_name: name,
                missing: list,
                route_id: routeId,
                route_number: routeNumber,
              },
            } as never);
          }
        } catch (e) {
          warnings.push(
            `Уведомления: ${e instanceof Error ? e.message : "ошибка"}`,
          );
        }

        const totalMissing = importedRows.filter(
          (r) => r.missingFields.length > 0,
        ).length;

        // 5b. Товарный состав — опционально.
        // Сопоставление по orders.order_number ИЛИ orders.onec_order_number.
        let itemsCreated = 0;
        let itemsUnmatched = 0;
        const ordersWithoutItems: string[] = [];
        const itemWarnings: string[] = [];
        const itemsByOrderNumber = payload.itemsByOrderNumber ?? {};
        const itemKeys = Object.keys(itemsByOrderNumber);

        if (itemKeys.length > 0) {
          const usedKeys = new Set<string>();
          // Индексы для матчинга
          const ordersByKey = new Map<string, { id: string }>();
          for (const r of importedRows) {
            if (!r.orderId) continue;
            const candidates = new Set<string>();
            const norm = (s: string | null | undefined) =>
              (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
            const a = norm(r.orderNumber);
            if (a) candidates.add(a);
            // onec_order_number из исходных данных
            const src = payload.orders.find((x) => x.rowIndex === r.rowIndex);
            const b = norm(src?.orderNumber);
            if (b) candidates.add(b);
            for (const k of candidates) {
              if (!ordersByKey.has(k)) ordersByKey.set(k, { id: r.orderId });
            }
          }

          for (const [rawKey, rows] of Object.entries(itemsByOrderNumber)) {
            const key = (rawKey ?? "").trim().toUpperCase().replace(/\s+/g, "");
            const target = ordersByKey.get(key);
            if (!target) {
              itemsUnmatched += rows.length;
              itemWarnings.push(
                `Не сопоставлен товарный состав заказа ${rawKey} (строк: ${rows.length})`,
              );
              continue;
            }
            usedKeys.add(key);
            try {
              const toInsert = rows.map((it) => ({
                order_id: target.id,
                nomenclature: it.nomenclature?.trim() || it.raw_text?.slice(0, 240) || "—",
                characteristic: it.characteristic,
                quality: it.quality,
                qty: it.qty ?? 0,
                unit: it.unit,
                weight_kg: it.weight_kg,
                volume_m3: it.volume_m3,
                comment: it.needsReview
                  ? [it.comment, `⚠ Требует проверки`, it.raw_text]
                      .filter(Boolean)
                      .join(" · ")
                  : it.comment,
                external_id: it.lineNumber != null ? String(it.lineNumber) : null,
                source: "excel" as const,
              }));
              const { error: iErr } = await sb
                .from("order_items")
                .insert(toInsert as never);
              if (iErr) {
                itemWarnings.push(
                  `Товарный состав ${rawKey}: ${iErr.message}`,
                );
              } else {
                itemsCreated += toInsert.length;
                const reviewCount = rows.filter((r) => r.needsReview).length;
                if (reviewCount > 0) {
                  itemWarnings.push(
                    `Товарный состав ${rawKey}: ${reviewCount} строк сохранены как raw_text (требуют проверки)`,
                  );
                }
              }
            } catch (e) {
              itemWarnings.push(
                `Товарный состав ${rawKey}: ${e instanceof Error ? e.message : "ошибка"}`,
              );
            }
          }

          // Заказы, для которых не пришёл товарный состав вообще
          for (const r of importedRows) {
            if (!r.orderId) continue;
            const norm = (s: string | null | undefined) =>
              (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
            const src = payload.orders.find((x) => x.rowIndex === r.rowIndex);
            const a = norm(r.orderNumber);
            const b = norm(src?.orderNumber);
            if (!usedKeys.has(a) && !usedKeys.has(b)) {
              ordersWithoutItems.push(r.orderNumber);
            }
          }
        }

        if (itemWarnings.length > 0) warnings.push(...itemWarnings);

        // 6b. Пересчёт total_weight_kg/total_volume_m3 по товарам и points_count.
        const allItems = Object.values(itemsByOrderNumber).flat();
        const sumWeight = allItems.reduce((s, it) => s + (it.weight_kg ?? 0), 0);
        const sumVolume = allItems.reduce((s, it) => s + (it.volume_m3 ?? 0), 0);
        try {
          await sb
            .from("routes")
            .update({
              points_count: inserted,
              ...(sumWeight > 0 ? { total_weight_kg: sumWeight } : {}),
              ...(sumVolume > 0 ? { total_volume_m3: sumVolume } : {}),
            } as never)
            .eq("id", routeId);
        } catch {
          /* не критично */
        }

        // 6c. Автопередача водителю: если при импорте однозначно распознаны
        // водитель и ТС и в маршруте есть точки — создаём delivery_route
        // в статусе "issued", чтобы заявка сразу появилась в /driver.
        // Идемпотентно: пропускаем, если delivery_route уже создан вручную.
        let deliveryRouteIssued: { id: string; routeNumber: string | null } | null = null;
        if (driverId && inserted > 0) {
          try {
            const { data: existingDr } = await sb
              .from("delivery_routes")
              .select("id, route_number, status, driver_id")
              .eq("source_request_id", routeId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const existing = existingDr as
              | { id: string; route_number: string | null; status: string; driver_id: string | null }
              | null;
            if (!existing) {
              const { data: createdDr, error: drErr } = await sb
                .from("delivery_routes")
                .insert({
                  route_date: routeDate,
                  source_request_id: routeId,
                  source_warehouse_id: warehouseId,
                  carrier_id: carrierId,
                  driver_id: driverId,
                  assigned_driver: payload.driverName ?? null,
                  assigned_vehicle: payload.vehiclePlate ?? null,
                  status: "issued",
                } as never)
                .select("id, route_number")
                .single();
              if (drErr) {
                console.error(
                  "[import-route-sheet] delivery_routes auto-issue failed:",
                  drErr,
                );
                warnings.push(
                  `Автопередача водителю не выполнена: ${drErr.message}. Создайте маршрут вручную из заявки.`,
                );
              } else if (createdDr) {
                const dr = createdDr as { id: string; route_number: string | null };
                deliveryRouteIssued = { id: dr.id, routeNumber: dr.route_number };
                try {
                  await sb
                    .from("routes")
                    .update({
                      request_status: "in_progress",
                      request_status_changed_at: new Date().toISOString(),
                      request_status_comment: `Маршрут ${dr.route_number ?? ""} автоматически передан водителю при импорте`.trim(),
                    } as never)
                    .eq("id", routeId);
                } catch {
                  /* не критично */
                }
              }
            } else {
              // Если уже есть delivery_route, но без driver_id — допишем driver_id,
              // чтобы маршрут появился у водителя.
              if (!existing.driver_id) {
                await sb
                  .from("delivery_routes")
                  .update({
                    driver_id: driverId,
                    assigned_driver: payload.driverName ?? null,
                    assigned_vehicle: payload.vehiclePlate ?? null,
                    ...(existing.status === "draft" || existing.status === "formed"
                      ? { status: "issued" }
                      : {}),
                  } as never)
                  .eq("id", existing.id);
              }
              deliveryRouteIssued = { id: existing.id, routeNumber: existing.route_number };
            }
          } catch (e) {
            console.error("[import-route-sheet] auto-issue exception:", e);
            warnings.push(
              `Автопередача водителю не выполнена: ${e instanceof Error ? e.message : "ошибка"}.`,
            );
          }
        } else if (!driverId && inserted > 0) {
          warnings.push(
            "Водитель не распознан — маршрут не передан в исполнение автоматически.",
          );
        }



        return jsonResponse({
          ok: true,
          routeId,
          routeNumber,
          source: routeSource,
          inserted,
          total: payload.orders.length,
          pointsCreated: inserted,
          deliveryRouteIssued,

          itemsCreated,
          itemsUnmatched,
          ordersWithoutItems,
          itemWarnings,
          failedRows,
          warnings,
          headerMissing,
          trUnrecognized,
          rows: importedRows,
          missingRowsCount: totalMissing,
          clientsNeedingFill: Array.from(clientsNeedingFill.values()).map(
            (c) => ({
              name: c.name,
              clientId: c.clientId,
              missing: Array.from(c.missing),
            }),
          ),
          managers: Array.from(managerCache.entries())
            .filter((entry): entry is [string, ResolvedManager] => entry[1] !== null)
            .map(([, m]) => ({
              id: m.id,
              fullName: m.fullName,
              createdManager: m.createdManager,
              inviteCreated: m.inviteCreated,
              inviteUrl: m.inviteUrl,
            })),
          needsReview:
            headerMissing.length > 0 ||
            totalMissing > 0 ||
            failedRows.length > 0 ||
            trUnrecognized.length > 0,
        });
      },
    },
  },
});

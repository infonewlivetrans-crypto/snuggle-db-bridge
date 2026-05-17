import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { normalizeRuPhone } from "@/lib/phone";
import { geocodeOrderRow } from "@/server/order-geocode.server";

/**
 * Импорт одиночного файла «Заявка на транспорт» → черновик routes.
 *
 * Принципы (по подтверждённому ТЗ):
 * - используем существующую таблицу routes, никаких миграций;
 * - source='transport_request', request_status='draft', status='planned';
 * - всё, что не лезет в колонки, пакуем структурированно в transport_comment / comment;
 * - водитель/авто/перевозчик не найдены → null + warning (не блокируем);
 * - дубль по номеру → 409 с conflict, без падения;
 * - геокод выгрузки — через серверный контур (geocodeOrderRow → /yandex.server),
 *   ошибки только в warnings.
 */

type IncomingPayload = {
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

function buildTransportComment(p: IncomingPayload, unrecognized: string[]): string {
  const lines: string[] = [];
  const push = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      lines.push(`${label}: ${value}`);
    }
  };
  push("Адрес погрузки", p.loadingAddress);
  push("Адрес выгрузки", p.unloadingAddress);
  if (p.loadingDate || p.loadingTime) {
    push("Погрузка", `${p.loadingDate ?? ""}${p.loadingTime ? " " + p.loadingTime : ""}`.trim());
  }
  push("Грузоотправитель", p.shipper);
  push("Грузополучатель", p.consignee);
  push("Контактное лицо", p.contactPerson);
  push("Телефон", p.contactPhone);
  push("Груз", p.cargoDescription);
  push("Вес, кг", p.weightKg);
  push("Объём, м³", p.volumeM3);
  push("Мест", p.placesCount);
  push("Требования к ТС", p.vehicleRequirements);
  if (p.orderNumbers.length) push("Номера заказов", p.orderNumbers.join(", "));
  if (unrecognized.length) lines.push(`Не распознано: ${unrecognized.join(", ")}`);
  return lines.join("\n");
}

function buildAuditComment(p: IncomingPayload): string {
  const entries = Object.entries(p.raw ?? {}).slice(0, 50);
  if (entries.length === 0) return "";
  return [
    "Импорт из файла «Заявка на транспорт». Исходные поля:",
    ...entries.map(([k, v]) => `• ${k}: ${v}`),
  ].join("\n");
}

export const Route = createFileRoute("/api/import-transport-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        let payload: IncomingPayload;
        try {
          payload = (await request.json()) as IncomingPayload;
        } catch {
          return jsonResponse({ error: "Не удалось прочитать данные импорта" }, { status: 400 });
        }

        const warnings: string[] = [];
        const unrecognized: string[] = [];

        // Имя номера для routes.route_number / onec_request_number
        const rawNumber = payload.requestNumber?.trim() ?? null;
        const routeNumber = rawNumber || `TR-${Date.now().toString().slice(-8)}`;

        // 1) Дубль по onec_request_number или route_number
        if (rawNumber) {
          const { data: dupByOnec } = await sb
            .from("routes")
            .select("id, route_number")
            .eq("onec_request_number", rawNumber)
            .maybeSingle();
          const { data: dupByNumber } = dupByOnec
            ? { data: null as { id: string; route_number: string } | null }
            : await sb
                .from("routes")
                .select("id, route_number")
                .eq("route_number", routeNumber)
                .maybeSingle();
          const dup = (dupByOnec ?? dupByNumber) as { id: string; route_number: string } | null;
          if (dup) {
            return jsonResponse(
              {
                error: `Заявка на транспорт №${rawNumber} уже импортирована`,
                code: "transport_request_already_imported",
                routeId: dup.id,
                routeNumber: dup.route_number,
              },
              { status: 409 },
            );
          }
        }

        // 2) Тихий поиск перевозчика (без upsert, чтобы не плодить мусор)
        let carrierId: string | null = null;
        if (payload.carrier) {
          try {
            const { data } = await sb
              .from("carriers")
              .select("id")
              .ilike("company_name", payload.carrier)
              .maybeSingle();
            if (data) carrierId = (data as { id: string }).id;
          } catch {
            /* ignore */
          }
        }
        if (!carrierId && payload.carrier) {
          warnings.push(`Перевозчик «${payload.carrier}» не найден — оставлено пустым.`);
        }

        // 3) Водитель и ТС — только если carrier найден; не создаём новых сущностей
        let driverId: string | null = null;
        if (payload.driverName && carrierId) {
          try {
            const { data } = await sb
              .from("drivers")
              .select("id")
              .eq("carrier_id", carrierId)
              .ilike("full_name", payload.driverName)
              .maybeSingle();
            if (data) driverId = (data as { id: string }).id;
          } catch {
            /* ignore */
          }
        }
        if (!driverId && payload.driverName) {
          warnings.push(`Водитель «${payload.driverName}» не найден — можно назначить вручную.`);
        }

        let vehicleId: string | null = null;
        if (payload.vehiclePlate && carrierId) {
          try {
            const plate = payload.vehiclePlate.trim();
            const { data } = await sb
              .from("vehicles")
              .select("id")
              .eq("carrier_id", carrierId)
              .ilike("plate_number", plate)
              .maybeSingle();
            if (data) vehicleId = (data as { id: string }).id;
          } catch {
            /* ignore */
          }
        }
        if (!vehicleId && payload.vehiclePlate) {
          warnings.push(`Авто «${payload.vehiclePlate}» не найдено — можно назначить вручную.`);
        }

        // 4) Склад погрузки — нестрогий поиск по имени/адресу
        let warehouseId: string | null = null;
        if (payload.loadingAddress) {
          try {
            const { data } = await sb
              .from("warehouses")
              .select("id")
              .or(
                `name.ilike.%${payload.loadingAddress.slice(0, 40)}%,address.ilike.%${payload.loadingAddress.slice(0, 40)}%`,
              )
              .limit(1)
              .maybeSingle();
            if (data) warehouseId = (data as { id: string }).id;
          } catch {
            /* ignore */
          }
        }

        // 5) Геокодирование адреса выгрузки — best-effort
        let unloadingGeo: { lat: number; lng: number; formatted_address: string | null } | null = null;
        if (payload.unloadingAddress) {
          try {
            // default_geocode_region из system_settings
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
            const r = await geocodeOrderRow(sb, payload.unloadingAddress, {
              defaultRegion,
            });
            if (r) {
              unloadingGeo = { lat: r.lat, lng: r.lng, formatted_address: r.formatted_address };
            } else {
              warnings.push("Адрес выгрузки не удалось геокодировать — координаты не сохранены.");
            }
          } catch (e) {
            warnings.push(
              `Геокодер: ${e instanceof Error ? e.message : "ошибка"} — координаты выгрузки не сохранены.`,
            );
          }
        }

        // Нераспознанное (для финального резюме)
        if (!payload.loadingDate) unrecognized.push("дата погрузки");
        if (!payload.loadingAddress) unrecognized.push("адрес погрузки");
        if (!payload.unloadingAddress) unrecognized.push("адрес выгрузки");
        if (!payload.cargoDescription) unrecognized.push("описание груза");
        if (!payload.contactPhone) unrecognized.push("контактный телефон");

        const transportComment = buildTransportComment(payload, unrecognized);
        const auditComment = buildAuditComment(payload);

        // 6) INSERT в routes — черновик
        const routeDate = payload.loadingDate || payload.requestDate || new Date().toISOString().slice(0, 10);
        const driverPhoneNorm = payload.driverPhone
          ? (normalizeRuPhone(payload.driverPhone) ?? payload.driverPhone)
          : null;

        const insertPayload = {
          route_number: routeNumber,
          route_date: routeDate,
          request_type: "client_delivery",
          status: "planned",
          request_status: "draft",
          source: "transport_request",
          organization: payload.organization,
          onec_request_number: rawNumber,
          carrier_id: carrierId,
          driver_id: driverId,
          vehicle_id: vehicleId,
          warehouse_id: warehouseId,
          driver_name: payload.driverName,
          departure_time: payload.loadingTime,
          planned_departure_at:
            payload.loadingDate && payload.loadingTime
              ? `${payload.loadingDate}T${payload.loadingTime}:00`
              : null,
          total_weight_kg: payload.weightKg ?? 0,
          total_volume_m3: payload.volumeM3 ?? 0,
          transport_comment: transportComment || null,
          comment: auditComment || null,
          request_status_comment:
            unrecognized.length > 0 ? `Требует проверки: ${unrecognized.join(", ")}` : null,
        };

        const { data: route, error: rErr } = await sb
          .from("routes")
          .insert(insertPayload as never)
          .select("id, route_number")
          .single();

        if (rErr || !route) {
          if (rErr?.code === "23505") {
            return jsonResponse(
              {
                error: `Заявка на транспорт №${routeNumber} уже существует`,
                code: "transport_request_already_imported",
                routeNumber,
              },
              { status: 409 },
            );
          }
          console.error("[import-transport-request] insert failed:", rErr);
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

        const routeId = (route as { id: string }).id;

        // Сохраняем телефон водителя, если нашли водителя
        if (driverId && driverPhoneNorm) {
          try {
            await sb.from("drivers").update({ phone: driverPhoneNorm } as never).eq("id", driverId);
          } catch {
            /* не критично */
          }
        }

        return jsonResponse({
          ok: true,
          routeId,
          routeNumber: (route as { route_number: string }).route_number,
          summary: {
            requestNumber: rawNumber,
            requestDate: payload.requestDate,
            loadingDate: payload.loadingDate,
            loadingTime: payload.loadingTime,
            loadingAddress: payload.loadingAddress,
            unloadingAddress: payload.unloadingAddress,
            unloadingGeo,
            cargo: payload.cargoDescription,
            weightKg: payload.weightKg,
            volumeM3: payload.volumeM3,
            placesCount: payload.placesCount,
            orderNumbers: payload.orderNumbers,
          },
          warnings,
          unrecognized,
        });
      },
    },
  },
});

import { supabase } from "@/integrations/supabase/client";

export type ManifestPoint = {
  point_number: number;
  order_number: string;
  contact_name: string | null;
  contact_phone: string | null;
  delivery_address: string | null;
  map_link: string | null;
  latitude: number | null;
  longitude: number | null;
  amount_due: number | null;
  payment_type: string;
  payment_status: string;
  requires_qr: boolean;
  manager_comment: string | null;
};

export type ManifestData = {
  route_number: string;
  route_date: string;
  driver: string | null;
  vehicle: string | null;
  warehouse: string | null;
  points: ManifestPoint[];
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  prepaid: "Предоплата",
  invoice: "Счёт / б/н",
};

export async function loadManifest(deliveryRouteId: string): Promise<ManifestData> {
  const { data: route, error: rErr } = await supabase
    .from("delivery_routes")
    .select(
      "route_number, route_date, assigned_driver, assigned_vehicle, source_request_id, source_warehouse:source_warehouse_id(name, city)",
    )
    .eq("id", deliveryRouteId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!route) throw new Error("Маршрут не найден");

  const r = route as unknown as {
    route_number: string;
    route_date: string;
    assigned_driver: string | null;
    assigned_vehicle: string | null;
    source_request_id: string;
    source_warehouse: { name: string; city: string | null } | null;
  };

  const { data: pts, error: pErr } = await supabase
    .from("route_points")
    .select(
      "point_number, order:order_id(order_number, contact_name, contact_phone, delivery_address, map_link, latitude, longitude, amount_due, payment_type, payment_status, requires_qr, comment)",
    )
    .eq("route_id", r.source_request_id)
    .order("point_number", { ascending: true });
  if (pErr) throw pErr;

  const points: ManifestPoint[] = ((pts ?? []) as unknown as Array<{
    point_number: number;
    order: {
      order_number: string;
      contact_name: string | null;
      contact_phone: string | null;
      delivery_address: string | null;
      map_link: string | null;
      latitude: number | null;
      longitude: number | null;
      amount_due: number | null;
      payment_type: string;
      payment_status: string;
      requires_qr: boolean;
      comment: string | null;
    } | null;
  }>).map((p) => ({
    point_number: p.point_number,
    order_number: p.order?.order_number ?? "",
    contact_name: p.order?.contact_name ?? null,
    contact_phone: p.order?.contact_phone ?? null,
    delivery_address: p.order?.delivery_address ?? null,
    map_link: p.order?.map_link ?? null,
    latitude: p.order?.latitude ?? null,
    longitude: p.order?.longitude ?? null,
    amount_due: p.order?.amount_due ?? null,
    payment_type: p.order?.payment_type ?? "cash",
    payment_status: p.order?.payment_status ?? "not_paid",
    requires_qr: !!p.order?.requires_qr,
    manager_comment: p.order?.comment ?? null,
  }));

  return {
    route_number: r.route_number,
    route_date: r.route_date,
    driver: r.assigned_driver,
    vehicle: r.assigned_vehicle,
    warehouse: r.source_warehouse
      ? `${r.source_warehouse.name}${r.source_warehouse.city ? `, ${r.source_warehouse.city}` : ""}`
      : null,
    points,
  };
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isPrepaid(p: ManifestPoint): boolean {
  return p.payment_type === "prepaid" || p.payment_status === "paid";
}

function reminders(p: ManifestPoint): string[] {
  const list: string[] = [];
  if (p.requires_qr) list.push("⚠️ Получить QR-код маркетплейса");
  if (isPrepaid(p)) {
    list.push("✅ Оплачено заранее — деньги не брать");
  } else if (p.payment_type === "cash") {
    const sum = p.amount_due
      ? `${Number(p.amount_due).toLocaleString("ru-RU")} ₽`
      : "указанную сумму";
    list.push(`💵 Получить наличные: ${sum}`);
  }
  return list;
}

function mapHref(p: ManifestPoint): string | null {
  if (p.map_link) return p.map_link;
  if (p.latitude != null && p.longitude != null) {
    return `https://maps.google.com/?q=${p.latitude},${p.longitude}`;
  }
  if (p.delivery_address) {
    return `https://maps.google.com/?q=${encodeURIComponent(p.delivery_address)}`;
  }
  return null;
}

export function buildManifestHtml(m: ManifestData): string {
  const dateStr = new Date(m.route_date).toLocaleDateString("ru-RU");
  const pointsHtml = m.points
    .map((p) => {
      const map = mapHref(p);
      const rems = reminders(p);
      const coords =
        p.latitude != null && p.longitude != null
          ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
          : "";
      return `
        <article class="point">
          <header class="point-h">
            <div class="num">${p.point_number}</div>
            <div class="ord">
              <div class="ord-num">Заказ № ${escapeHtml(p.order_number)}</div>
              <div class="ord-client">${escapeHtml(p.contact_name) || "—"}</div>
            </div>
          </header>
          <div class="row"><span class="lbl">Телефон:</span> ${
            p.contact_phone
              ? `<a href="tel:${escapeHtml(p.contact_phone)}">${escapeHtml(p.contact_phone)}</a>`
              : "—"
          }</div>
          <div class="row"><span class="lbl">Адрес:</span> ${escapeHtml(p.delivery_address) || "—"}</div>
          ${
            map
              ? `<div class="row"><span class="lbl">Карта:</span> <a href="${escapeHtml(map)}" target="_blank" rel="noopener">Открыть на карте</a>${
                  coords ? ` <span class="muted">(${coords})</span>` : ""
                }</div>`
              : coords
                ? `<div class="row"><span class="lbl">Координаты:</span> ${coords}</div>`
                : ""
          }
          <div class="row">
            <span class="lbl">Сумма к получению:</span>
            ${
              p.amount_due != null
                ? `<b>${Number(p.amount_due).toLocaleString("ru-RU")} ₽</b>`
                : "—"
            }
            <span class="muted"> · ${escapeHtml(PAYMENT_LABELS[p.payment_type] ?? p.payment_type)}</span>
          </div>
          <div class="row">
            <span class="lbl">Оплачено заранее:</span> <b>${isPrepaid(p) ? "да" : "нет"}</b>
            &nbsp;·&nbsp;
            <span class="lbl">Нужен QR:</span> <b>${p.requires_qr ? "да" : "нет"}</b>
          </div>
          ${
            p.manager_comment
              ? `<div class="row comment"><span class="lbl">Комментарий менеджера:</span> ${escapeHtml(p.manager_comment)}</div>`
              : ""
          }
          ${
            rems.length > 0
              ? `<ul class="reminders">${rems.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
              : ""
          }
          <div class="signoff">
            <span>Время прибытия: ____:____</span>
            <span>Подпись клиента: ______________</span>
          </div>
        </article>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Маршрутный лист ${escapeHtml(m.route_number)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #111;
    margin: 0;
    padding: 16px;
    font-size: 13px;
    line-height: 1.4;
    background: #fff;
  }
  .sheet { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .head { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .head .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 16px; margin-top: 8px; }
  .head .meta div { font-size: 12px; }
  .head .meta b { font-weight: 600; }
  .point {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .point-h { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .point-h .num {
    background: #111; color: #fff; width: 28px; height: 28px;
    border-radius: 999px; display: flex; align-items: center; justify-content: center;
    font-weight: 700; flex-shrink: 0;
  }
  .ord-num { font-weight: 700; }
  .ord-client { color: #374151; font-size: 12px; }
  .row { margin: 3px 0; }
  .lbl { color: #6b7280; }
  .muted { color: #9ca3af; }
  .comment { background: #fef3c7; border-radius: 4px; padding: 4px 6px; }
  .reminders {
    margin: 6px 0 0; padding: 6px 10px 6px 26px;
    background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px;
    list-style: disc;
  }
  .reminders li { margin: 2px 0; }
  .signoff {
    margin-top: 8px; padding-top: 6px; border-top: 1px dashed #d1d5db;
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 11px; color: #4b5563;
  }
  a { color: #2563eb; text-decoration: none; }
  .actions {
    position: sticky; top: 0; background: #f9fafb; padding: 8px;
    margin: -16px -16px 16px; border-bottom: 1px solid #e5e7eb;
    display: flex; gap: 8px; justify-content: flex-end; z-index: 10;
  }
  .actions button {
    background: #2563eb; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 6px; font-size: 14px; cursor: pointer;
  }
  .actions .secondary { background: #6b7280; }
  @media print {
    .actions { display: none; }
    body { padding: 0; }
    .sheet { max-width: none; }
    .point { border-color: #999; }
  }
  @media (max-width: 480px) {
    .head .meta { grid-template-columns: 1fr; }
    .signoff { flex-direction: column; gap: 4px; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button class="secondary" onclick="window.close()">Закрыть</button>
    <button onclick="window.print()">Печать / Сохранить PDF</button>
  </div>
  <div class="sheet">
    <div class="head">
      <h1>Маршрутный лист № ${escapeHtml(m.route_number)}</h1>
      <div class="meta">
        <div><b>Дата:</b> ${escapeHtml(dateStr)}</div>
        <div><b>Водитель:</b> ${escapeHtml(m.driver) || "—"}</div>
        <div><b>Машина:</b> ${escapeHtml(m.vehicle) || "—"}</div>
        <div><b>Склад отправления:</b> ${escapeHtml(m.warehouse) || "—"}</div>
        <div><b>Точек в маршруте:</b> ${m.points.length}</div>
      </div>
    </div>
    ${pointsHtml || '<p style="text-align:center;color:#6b7280">Нет точек в маршруте.</p>'}
  </div>
</body>
</html>`;
}

export async function openRouteManifest(deliveryRouteId: string): Promise<void> {
  const data = await loadManifest(deliveryRouteId);
  const html = buildManifestHtml(data);
  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("Не удалось открыть окно. Разрешите всплывающие окна.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

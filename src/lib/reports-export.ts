import { apiGetAuth, fetchListViaApi } from "@/lib/api-client";
// Тяжёлые библиотеки `xlsx`, `docx`, `file-saver` подключаются лениво
// внутри функций, чтобы не попадать в initial bundle.
import { STATUS_LABELS, PAYMENT_LABELS, type OrderStatus, type PaymentType } from "@/lib/orders";

// ---------- helpers ----------

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("ru-RU");
}

async function downloadXlsx(rows: Array<Record<string, unknown>>, sheetName: string, fileName: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

async function downloadDocx(title: string, headers: string[], rows: string[][], fileName: string) {
  const [
    {
      Document,
      Packer,
      Paragraph,
      TextRun,
      HeadingLevel,
      Table,
      TableRow,
      TableCell,
      WidthType,
      BorderStyle,
      ShadingType,
      AlignmentType,
    },
    FileSaverMod,
  ] = await Promise.all([import("docx"), import("file-saver")]);
  const saveAs = (FileSaverMod as unknown as { default: { saveAs: (b: Blob, n: string) => void } }).default.saveAs;

  const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          borders: cellBorders,
          shading: { fill: "E8EEF5", type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        }),
    ),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map(
          (c) =>
            new TableCell({
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun(c ?? "")] })],
            }),
        ),
      }),
  );
  const table = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [headRow, ...bodyRows],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: title, bold: true, size: 32 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Сформировано: ${new Date().toLocaleString("ru-RU")}`,
                italics: true,
                size: 20,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun(" ")] }),
          table,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}

// ---------- helpers ----------

type DeliveryReportRow = {
  order_id: string;
  delivered_at: string | null;
  outcome: string;
  reason: string | null;
  driver_name: string | null;
  requires_resend: boolean | null;
  comment: string | null;
};

type OrderLite = {
  id: string;
  order_number: string;
  delivery_address: string | null;
};

type OrderPaymentRow = {
  order_number: string;
  payment_type: string | null;
  status: string;
  cash_received: boolean | null;
  qr_received: boolean | null;
  delivery_address: string | null;
  updated_at: string;
};

type DriverRow = { id: string; full_name: string | null; phone: string | null };

type RouteRow = {
  route_number: string;
  route_date: string;
  request_type: string;
  driver_name: string | null;
  points_count: number | null;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  status: string;
};

async function fetchAllPaged<T>(
  path: string,
  extra: Record<string, string | number | boolean | undefined> = {},
  pageSize = 100,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  // hard cap чтобы не уйти в бесконечный цикл
  for (let i = 0; i < 200; i++) {
    const { rows, total } = await fetchListViaApi<T>(path, {
      limit: pageSize,
      offset,
      extra,
    });
    out.push(...rows);
    if (rows.length < pageSize || out.length >= total) break;
    offset += pageSize;
  }
  return out;
}

// ---------- 1. Отчёт по доставке ----------

export async function exportDeliveryReport(format: "xlsx" | "docx") {
  // /api/delivery-reports?all=1 — отдаёт до 1000 строк за один запрос,
  // отчётный набор обычно укладывается в одну страницу.
  const data = await apiGetAuth<DeliveryReportRow[]>(
    "/api/delivery-reports?all=1&limit=1000",
  );

  const orderIds = Array.from(new Set((data ?? []).map((r) => r.order_id))).filter(Boolean);
  const ordersMap = new Map<string, { order_number: string; delivery_address: string | null }>();
  if (orderIds.length) {
    const orders = await apiGetAuth<OrderLite[]>(
      `/api/orders?ids=${encodeURIComponent(orderIds.join(","))}&limit=100`,
    );
    for (const o of orders ?? []) {
      ordersMap.set(o.id, { order_number: o.order_number, delivery_address: o.delivery_address });
    }
  }

  const headers = ["Дата", "Заказ", "Адрес", "Итог", "Причина", "Водитель", "Повторная", "Комментарий"];
  const rowsArr = (data ?? []).map((r) => {
    const o = ordersMap.get(r.order_id);
    return [
      fmtDate(r.delivered_at),
      o?.order_number ?? r.order_id.slice(0, 8),
      o?.delivery_address ?? "",
      r.outcome,
      r.reason ?? "",
      r.driver_name ?? "",
      r.requires_resend ? "Да" : "",
      r.comment ?? "",
    ];
  });

  if (format === "xlsx") {
    const json = rowsArr.map((row) =>
      Object.fromEntries(headers.map((h, i) => [h, row[i]])),
    );
    await downloadXlsx(json, "Доставки", `delivery_report_${Date.now()}.xlsx`);
  } else {
    await downloadDocx("Отчёт по доставкам", headers, rowsArr, `delivery_report_${Date.now()}.docx`);
  }
}

// ---------- 2. Отчёт по оплатам ----------

export async function exportPaymentsReport(format: "xlsx" | "docx") {
  const data = await fetchAllPaged<OrderPaymentRow>("/api/orders");

  const headers = ["Заказ", "Тип оплаты", "Статус", "Наличные получены", "QR получен", "Адрес", "Обновлено"];
  const rowsArr = data.map((o) => [
    o.order_number,
    PAYMENT_LABELS[o.payment_type as PaymentType] ?? (o.payment_type ?? ""),
    STATUS_LABELS[o.status as OrderStatus] ?? o.status,
    o.cash_received ? "Да" : "Нет",
    o.qr_received ? "Да" : "Нет",
    o.delivery_address ?? "",
    fmtDate(o.updated_at),
  ]);

  if (format === "xlsx") {
    const json = rowsArr.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
    await downloadXlsx(json, "Оплаты", `payments_report_${Date.now()}.xlsx`);
  } else {
    await downloadDocx("Отчёт по оплатам", headers, rowsArr, `payments_report_${Date.now()}.docx`);
  }
}

// ---------- 3. Отчёт по водителям ----------

export async function exportDriversReport(format: "xlsx" | "docx") {
  const drivers = await fetchAllPaged<DriverRow>("/api/drivers", { activeOnly: 1 });
  const reports = await apiGetAuth<DeliveryReportRow[]>(
    "/api/delivery-reports?all=1&limit=1000",
  );

  const stats = new Map<string, { total: number; delivered: number; failed: number; resend: number }>();
  for (const r of reports ?? []) {
    const name = r.driver_name ?? "—";
    const s = stats.get(name) ?? { total: 0, delivered: 0, failed: 0, resend: 0 };
    s.total++;
    if (r.outcome === "delivered") s.delivered++;
    else s.failed++;
    if (r.requires_resend) s.resend++;
    stats.set(name, s);
  }

  const allNames = new Set<string>([...stats.keys()]);
  for (const d of drivers) if (d.full_name) allNames.add(d.full_name);

  const headers = ["Водитель", "Телефон", "Всего точек", "Доставлено", "Не доставлено", "Повторная"];
  const rowsArr = Array.from(allNames).map((name) => {
    const d = drivers.find((x) => x.full_name === name);
    const s = stats.get(name) ?? { total: 0, delivered: 0, failed: 0, resend: 0 };
    return [
      name,
      d?.phone ?? "",
      String(s.total),
      String(s.delivered),
      String(s.failed),
      String(s.resend),
    ];
  });

  if (format === "xlsx") {
    const json = rowsArr.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
    await downloadXlsx(json, "Водители", `drivers_report_${Date.now()}.xlsx`);
  } else {
    await downloadDocx("Отчёт по водителям", headers, rowsArr, `drivers_report_${Date.now()}.docx`);
  }
}

// ---------- 4. Отчёт по заявкам на транспорт ----------

export async function exportTransportRequestsReport(format: "xlsx" | "docx") {
  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .order("route_date", { ascending: false });
  if (error) throw error;

  const TYPE_LABELS: Record<string, string> = {
    client_delivery: "Доставка клиентам",
    warehouse_transfer: "Перемещение между складами",
    factory_to_warehouse: "Завод → склад",
  };

  const headers = ["№ заявки", "Дата", "Тип", "Водитель", "Точек", "Вес, кг", "Объём, м³", "Статус"];
  const rowsArr = (data ?? []).map((r) => [
    r.route_number,
    r.route_date,
    TYPE_LABELS[r.request_type] ?? r.request_type,
    r.driver_name ?? "",
    String(r.points_count ?? 0),
    String(r.total_weight_kg ?? 0),
    String(r.total_volume_m3 ?? 0),
    r.status,
  ]);

  if (format === "xlsx") {
    const json = rowsArr.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
    await downloadXlsx(json, "Заявки", `transport_requests_${Date.now()}.xlsx`);
  } else {
    await downloadDocx(
      "Отчёт по заявкам на транспорт",
      headers,
      rowsArr,
      `transport_requests_${Date.now()}.docx`,
    );
  }
}

export type ReportKind = "delivery" | "payments" | "drivers" | "transport";

export async function exportReport(kind: ReportKind, format: "xlsx" | "docx") {
  switch (kind) {
    case "delivery":
      return exportDeliveryReport(format);
    case "payments":
      return exportPaymentsReport(format);
    case "drivers":
      return exportDriversReport(format);
    case "transport":
      return exportTransportRequestsReport(format);
  }
}

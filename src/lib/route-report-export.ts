import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportPayload = {
  delivery_route_id: string;
  route_number: string;
  route_date: string;
  driver: string | null;
  vehicle: string | null;
  totals: {
    total: number;
    delivered: number;
    not_delivered: number;
    returned: number;
    amount_due: number;
    amount_received: number;
    amount_diff: number;
  };
  orders: Array<{
    order_id: string;
    order_number: string;
    contact_name: string | null;
    contact_phone?: string | null;
    delivery_address: string | null;
    dp_status: string;
    undelivered_reason: string | null;
    amount_due: number | null;
    amount_received: number | null;
    amount_diff: number;
    requires_qr: boolean;
    qr_received: boolean;
    cash_received: boolean;
    payment_comment: string | null;
    order_comment: string | null;
    photos: Array<{ kind: string; url: string }>;
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  delivered: "Доставлено",
  not_delivered: "Не доставлено",
  returned_to_warehouse: "Возврат на склад",
};

const REASON_LABEL: Record<string, string> = {
  client_absent: "клиента нет",
  client_no_answer: "клиент не отвечает",
  no_payment: "нет оплаты",
  no_qr: "нет QR-кода",
  client_refused: "отказ клиента",
  no_unloading: "нет возможности выгрузки",
  defective: "брак",
  other: "другое",
};

function fileBase(p: ReportPayload): string {
  const d = p.route_date ? p.route_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const safe = (p.route_number || "route").replace(/[^\w\-]+/g, "_");
  return `route_report_${safe}_${d}`;
}

function urlsByKind(photos: Array<{ kind: string; url: string }>, kind: string): string {
  return photos.filter((ph) => ph.kind === kind).map((ph) => ph.url).join("\n");
}

export function exportRouteReportXlsx(p: ReportPayload) {
  const wb = XLSX.utils.book_new();

  // Лист 1: Точки маршрута
  const rows = p.orders.map((o) => ({
    "Номер маршрута": p.route_number,
    Водитель: p.driver ?? "",
    Машина: p.vehicle ?? "",
    Дата: p.route_date,
    "Номер заказа": o.order_number,
    Клиент: o.contact_name ?? "",
    Телефон: o.contact_phone ?? "",
    Адрес: o.delivery_address ?? "",
    "Статус доставки": STATUS_LABEL[o.dp_status] ?? o.dp_status,
    "Причина недоставки":
      o.dp_status === "not_delivered"
        ? REASON_LABEL[o.undelivered_reason ?? ""] ?? o.undelivered_reason ?? ""
        : "",
    "Возврат на склад": o.dp_status === "returned_to_warehouse" ? "да" : "нет",
    "Сумма к получению": o.amount_due ?? 0,
    "Фактически получено": o.amount_received ?? 0,
    "Расхождение по оплате": o.amount_diff ?? 0,
    "QR требуется": o.requires_qr ? "да" : "нет",
    "QR получен": o.qr_received ? "да" : "нет",
    "Комментарий водителя": [o.order_comment, o.payment_comment].filter(Boolean).join(" · "),
    "Фото QR": urlsByKind(o.photos, "qr"),
    "Фото документов": urlsByKind(o.photos, "documents"),
    "Фото проблемы": urlsByKind(o.photos, "problem"),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
    { wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 32 }, { wch: 30 },
    { wch: 30 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Точки маршрута");

  // Лист 2: Итоги маршрута
  const totals = [
    ["Номер маршрута", p.route_number],
    ["Водитель", p.driver ?? ""],
    ["Машина", p.vehicle ?? ""],
    ["Дата", p.route_date],
    [],
    ["Всего точек", p.totals.total],
    ["Доставлено", p.totals.delivered],
    ["Не доставлено", p.totals.not_delivered],
    ["Возврат на склад", p.totals.returned],
    [],
    ["Общая сумма к получению", p.totals.amount_due],
    ["Фактически получено", p.totals.amount_received],
    ["Расхождение", p.totals.amount_diff],
  ];
  const wsT = XLSX.utils.aoa_to_sheet(totals);
  wsT["!cols"] = [{ wch: 28 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsT, "Итоги маршрута");

  XLSX.writeFile(wb, `${fileBase(p)}.xlsx`);
}

export function exportRouteReportPdf(p: ReportPayload) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text(`Otchyot po marshrutu ${p.route_number}`, 40, 40);
  doc.setFontSize(10);
  const headerLines = [
    `Data: ${p.route_date}`,
    `Voditel: ${p.driver ?? "-"}`,
    `Mashina: ${p.vehicle ?? "-"}`,
  ];
  doc.text(headerLines.join("    "), 40, 58);

  // Итоги маршрута
  autoTable(doc, {
    startY: 76,
    head: [["Itogi marshruta", ""]],
    body: [
      ["Vsego tochek", String(p.totals.total)],
      ["Dostavleno", String(p.totals.delivered)],
      ["Ne dostavleno", String(p.totals.not_delivered)],
      ["Vozvrat na sklad", String(p.totals.returned)],
      ["Obshchaya summa k polucheniyu", p.totals.amount_due.toLocaleString("ru-RU")],
      ["Fakticheski polucheno", p.totals.amount_received.toLocaleString("ru-RU")],
      [
        "Raskhozhdenie",
        (p.totals.amount_diff > 0 ? "+" : "") + p.totals.amount_diff.toLocaleString("ru-RU"),
      ],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 0: { cellWidth: 220 }, 1: { cellWidth: 140 } },
  });

  // Точки маршрута
  const body = p.orders.map((o) => [
    o.order_number,
    o.contact_name ?? "",
    o.contact_phone ?? "",
    o.delivery_address ?? "",
    STATUS_LABEL[o.dp_status] ?? o.dp_status,
    o.dp_status === "not_delivered"
      ? REASON_LABEL[o.undelivered_reason ?? ""] ?? o.undelivered_reason ?? ""
      : "",
    (o.amount_due ?? 0).toLocaleString("ru-RU"),
    (o.amount_received ?? 0).toLocaleString("ru-RU"),
    (o.amount_diff ?? 0).toLocaleString("ru-RU"),
    o.requires_qr ? (o.qr_received ? "da" : "net") : "-",
    [o.order_comment, o.payment_comment].filter(Boolean).join(" · "),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = (doc as any).lastAutoTable?.finalY ?? 76;
  autoTable(doc, {
    startY: lastY + 16,
    head: [[
      "Zakaz", "Klient", "Telefon", "Adres", "Status", "Prichina",
      "K poluch.", "Polucheno", "Raskhozhd.", "QR", "Kommentariy",
    ]],
    body,
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 90 },
      2: { cellWidth: 70 },
      3: { cellWidth: 140 },
      4: { cellWidth: 70 },
      5: { cellWidth: 80 },
      6: { cellWidth: 55, halign: "right" },
      7: { cellWidth: 55, halign: "right" },
      8: { cellWidth: 55, halign: "right" },
      9: { cellWidth: 30 },
      10: { cellWidth: "auto" },
    },
  });

  // Ссылки на фото — отдельным списком (URL могут быть длинными)
  const photoRows: string[][] = [];
  p.orders.forEach((o) => {
    o.photos.forEach((ph) => {
      photoRows.push([o.order_number, ph.kind, ph.url]);
    });
  });
  if (photoRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y2 = (doc as any).lastAutoTable?.finalY ?? 200;
    autoTable(doc, {
      startY: y2 + 16,
      head: [["Zakaz", "Tip foto", "Ssylka"]],
      body: photoRows,
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 90 }, 2: { cellWidth: "auto" } },
    });
  }

  doc.save(`${fileBase(p)}.pdf`);
}

// Клиентские константы модуля ЭТрН/ЭДО (без секретов, без сетевых вызовов).

export type EdoDocDirection = "incoming" | "outgoing" | "internal";
export type EdoDocType =
  | "etrn" | "upd" | "act" | "contract" | "invoice" | "transport_waybill" | "other";

export const EDO_DOC_DIRECTION_LABEL: Record<EdoDocDirection, string> = {
  incoming: "Входящий",
  outgoing: "Исходящий",
  internal: "Внутренний",
};

export const EDO_DOC_TYPE_OPTIONS: { value: EdoDocType; label: string }[] = [
  { value: "etrn", label: "ЭТрН (электронная транспортная накладная)" },
  { value: "upd", label: "УПД" },
  { value: "act", label: "Акт" },
  { value: "contract", label: "Договор" },
  { value: "invoice", label: "Счёт" },
  { value: "transport_waybill", label: "Транспортная накладная" },
  { value: "other", label: "Прочее" },
];

export const EDO_DOC_TYPE_LABEL: Record<EdoDocType, string> = Object.fromEntries(
  EDO_DOC_TYPE_OPTIONS.map(o => [o.value, o.label]),
) as Record<EdoDocType, string>;


export type EdoProvider =
  | "diadoc" | "sbis" | "taxcom" | "astral" | "sberkorus" | "other" | "internal_mock";

export type EdoConnectionStatus =
  | "not_connected" | "setup_required" | "connected" | "error" | "disabled";

export type EdoDocStatus =
  | "draft" | "created"
  | "ready_to_send" | "sending"
  | "waiting_shipper_signature" | "waiting_carrier_signature"
  | "waiting_driver_action" | "waiting_consignee_signature"
  | "signed" | "sent_to_operator" | "accepted_by_operator" | "rejected_by_operator"
  | "error" | "closed" | "cancelled";

export type EdoParticipantRole = "shipper" | "carrier" | "driver" | "consignee" | "operator";

export const EDO_PROVIDER_OPTIONS: { value: EdoProvider; label: string }[] = [
  { value: "diadoc", label: "Контур Диадок" },
  { value: "sbis", label: "СБИС" },
  { value: "taxcom", label: "Такском" },
  { value: "astral", label: "Калуга Астрал" },
  { value: "sberkorus", label: "СберКорус" },
  { value: "other", label: "Другой оператор" },
  { value: "internal_mock", label: "Пока не подключен (внутренний режим)" },
];

export const EDO_PROVIDER_LABEL: Record<EdoProvider, string> = {
  diadoc: "Контур Диадок",
  sbis: "СБИС",
  taxcom: "Такском",
  astral: "Калуга Астрал",
  sberkorus: "СберКорус",
  other: "Другой оператор",
  internal_mock: "Внутренний режим Радиус Трек",
};

export const EDO_CONNECTION_STATUS_LABEL: Record<EdoConnectionStatus, string> = {
  not_connected: "Не подключен",
  setup_required: "Требуется настройка",
  connected: "Подключено",
  error: "Ошибка",
  disabled: "Отключено",
};

export const EDO_DOC_STATUS_LABEL: Record<EdoDocStatus, string> = {
  draft: "Черновик",
  created: "Документ создан",
  ready_to_send: "Готов к отправке",
  sending: "Отправляется",
  waiting_shipper_signature: "Ожидает подписи грузоотправителя",
  waiting_carrier_signature: "Ожидает подписи перевозчика",
  waiting_driver_action: "Ожидает действия водителя",
  waiting_consignee_signature: "Ожидает подписи грузополучателя",
  signed: "Подписан",
  sent_to_operator: "Отправлен оператору",
  accepted_by_operator: "Принят оператором",
  rejected_by_operator: "Отклонён оператором",
  error: "Ошибка",
  closed: "Закрыт",
  cancelled: "Отменён",
};

export const EDO_PARTICIPANT_LABEL: Record<EdoParticipantRole, string> = {
  shipper: "Грузоотправитель",
  carrier: "Перевозчик",
  driver: "Водитель",
  consignee: "Грузополучатель",
  operator: "Оператор ЭДО",
};

export function edoDocStatusVariant(
  s: EdoDocStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "draft":
    case "created":
      return "secondary";
    case "waiting_shipper_signature":
    case "waiting_carrier_signature":
    case "waiting_driver_action":
    case "waiting_consignee_signature":
      return "outline";
    case "signed":
    case "accepted_by_operator":
    case "closed":
      return "default";
    case "error":
    case "rejected_by_operator":
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
}

export function edoAwaitingLabel(role: EdoParticipantRole | null | undefined): string | null {
  if (!role) return null;
  switch (role) {
    case "shipper": return "Сейчас ожидается подпись грузоотправителя";
    case "carrier": return "Сейчас ожидается подпись перевозчика";
    case "driver":  return "Сейчас ожидается действие водителя";
    case "consignee": return "Сейчас ожидается подпись грузополучателя";
    case "operator": return "Сейчас ожидается ответ оператора";
  }
}

// Этап 2: роли контрагентов ЭДО.
export type EdoCounterpartyRole = "shipper" | "consignee" | "both";

export const EDO_CP_ROLE_LABEL: Record<EdoCounterpartyRole, string> = {
  shipper: "Грузоотправитель",
  consignee: "Грузополучатель",
  both: "Универсальный",
};

export const EDO_CP_ROLE_OPTIONS: { value: EdoCounterpartyRole; label: string }[] = [
  { value: "both", label: "Универсальный (отправитель и получатель)" },
  { value: "shipper", label: "Грузоотправитель" },
  { value: "consignee", label: "Грузополучатель" },
];

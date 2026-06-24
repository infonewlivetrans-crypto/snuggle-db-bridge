// Каталог сценариев ЭПД и связанные константы.
// Используется и в UI, и на сервере — секретов нет.

export type EpdScenarioType =
  | "regular_transport"
  | "forwarder_no_possession"
  | "forwarder_with_possession"
  | "forwarder_warehouse_storage"
  | "intercompany_own_transport"
  | "intercompany_attracted_transport"
  | "pickup_own_transport"
  | "pickup_attracted_transport";

export type ForwarderPossessionMode =
  | "unknown"
  | "not_accepting_cargo"
  | "accepting_cargo_possession"
  | "warehouse_storage"
  | "agent_only";

export type CargoHolderRole =
  | "shipper" | "forwarder" | "warehouse" | "carrier" | "consignee";

export type EpdDocumentCode =
  | "electronic_transport_order"
  | "etrn"
  | "forwarding_order"
  | "forwarding_receipt"
  | "warehouse_receipt"
  | "electronic_waybill";

export type EpdParticipantRole =
  | "shipper" | "consignee" | "carrier" | "driver"
  | "forwarder" | "agent" | "warehouse" | "customer" | "observer";

export type EpdReadinessStatus =
  | "draft" | "valid" | "valid_with_warnings" | "invalid";

export type EpdTitleSigner =
  | "shipper" | "forwarder" | "carrier" | "driver" | "consignee";

export interface EpdSigningPlan {
  electronic_transport_order_signers: EpdTitleSigner[];
  etrn_t1: EpdTitleSigner;
  etrn_t2: EpdTitleSigner;
  etrn_t3: EpdTitleSigner;
  etrn_t4: EpdTitleSigner;
}

export interface EpdScenarioDef {
  type: EpdScenarioType;
  title: string;
  short: string;
  requires_forwarder: boolean;
  default_possession_mode: ForwarderPossessionMode;
  cargo_holder_role: CargoHolderRole;
  participants: EpdParticipantRole[];
  required_documents: EpdDocumentCode[];
  signing_plan: EpdSigningPlan;
  warnings: string[];
}

export const EPD_PARTICIPANT_LABEL: Record<EpdParticipantRole, string> = {
  shipper: "Грузоотправитель",
  consignee: "Грузополучатель",
  carrier: "Перевозчик",
  driver: "Водитель",
  forwarder: "Экспедитор",
  agent: "Агент/организатор",
  warehouse: "Склад экспедитора",
  customer: "Заказчик перевозки",
  observer: "Наблюдатель",
};

export const EPD_POSSESSION_LABEL: Record<ForwarderPossessionMode, string> = {
  unknown: "Не определено",
  not_accepting_cargo: "Экспедитор не принимает груз во владение",
  accepting_cargo_possession: "Экспедитор принимает груз во владение",
  warehouse_storage: "Экспедитор принимает груз на свой склад",
  agent_only: "Только агент/организатор без владения",
};

export const EPD_CARGO_HOLDER_LABEL: Record<CargoHolderRole, string> = {
  shipper: "Грузоотправитель",
  forwarder: "Экспедитор",
  warehouse: "Склад экспедитора",
  carrier: "Перевозчик (только физическая перевозка)",
  consignee: "Грузополучатель",
};

export const EPD_DOCUMENT_LABEL: Record<EpdDocumentCode, string> = {
  electronic_transport_order: "Электронная заказ-заявка перевозчику",
  etrn: "ЭТрН",
  forwarding_order: "Поручение экспедитору",
  forwarding_receipt: "Экспедиторская расписка",
  warehouse_receipt: "Складская расписка",
  electronic_waybill: "Электронный путевой лист",
};

export const EPD_TITLE_SIGNER_LABEL: Record<EpdTitleSigner, string> = {
  shipper: "Грузоотправитель",
  forwarder: "Экспедитор",
  carrier: "Перевозчик",
  driver: "Водитель",
  consignee: "Грузополучатель",
};

export const EPD_READINESS_STATUS_LABEL: Record<EpdReadinessStatus, string> = {
  draft: "Черновик",
  valid: "Готов к подготовке документа",
  valid_with_warnings: "Готов с замечаниями",
  invalid: "Не готов — есть критические ошибки",
};

export const EPD_SCENARIO_CATALOG: EpdScenarioDef[] = [
  {
    type: "regular_transport",
    title: "Обычная перевозка по договору перевозки",
    short: "Грузоотправитель ↔ Перевозчик ↔ Грузополучатель. Без экспедитора.",
    requires_forwarder: false,
    default_possession_mode: "unknown",
    cargo_holder_role: "shipper",
    participants: ["shipper", "carrier", "driver", "consignee"],
    required_documents: ["electronic_transport_order", "etrn"],
    signing_plan: {
      electronic_transport_order_signers: ["shipper", "carrier"],
      etrn_t1: "shipper", etrn_t2: "carrier", etrn_t3: "consignee", etrn_t4: "carrier",
    },
    warnings: [],
  },
  {
    type: "forwarder_no_possession",
    title: "Перевозка с экспедитором без принятия груза во владение",
    short: "Экспедитор организует перевозку, но грузом владеет грузоотправитель.",
    requires_forwarder: true,
    default_possession_mode: "not_accepting_cargo",
    cargo_holder_role: "shipper",
    participants: ["shipper", "forwarder", "carrier", "driver", "consignee"],
    required_documents: ["forwarding_order", "electronic_transport_order", "etrn"],
    signing_plan: {
      electronic_transport_order_signers: ["shipper", "carrier"],
      etrn_t1: "shipper", etrn_t2: "carrier", etrn_t3: "consignee", etrn_t4: "carrier",
    },
    warnings: [
      "Экспедитор не должен подписывать грузовые титулы вместо грузоотправителя.",
    ],
  },
  {
    type: "forwarder_with_possession",
    title: "Перевозка с экспедитором, который принимает груз во владение",
    short: "Экспедитор отвечает за груз и оформляет заявку перевозчику.",
    requires_forwarder: true,
    default_possession_mode: "accepting_cargo_possession",
    cargo_holder_role: "forwarder",
    participants: ["shipper", "forwarder", "carrier", "driver", "consignee"],
    required_documents: [
      "forwarding_order", "forwarding_receipt", "electronic_transport_order", "etrn",
    ],
    signing_plan: {
      electronic_transport_order_signers: ["forwarder", "carrier"],
      etrn_t1: "forwarder", etrn_t2: "carrier", etrn_t3: "consignee", etrn_t4: "carrier",
    },
    warnings: [
      "Нужна экспедиторская расписка приёма груза.",
    ],
  },
  {
    type: "forwarder_warehouse_storage",
    title: "Экспедитор принимает груз на свой склад",
    short: "Складская расписка + дальнейшая доставка.",
    requires_forwarder: true,
    default_possession_mode: "warehouse_storage",
    cargo_holder_role: "warehouse",
    participants: ["shipper", "forwarder", "warehouse", "carrier", "driver", "consignee"],
    required_documents: [
      "forwarding_order", "warehouse_receipt", "electronic_transport_order", "etrn",
    ],
    signing_plan: {
      electronic_transport_order_signers: ["forwarder", "carrier"],
      etrn_t1: "forwarder", etrn_t2: "carrier", etrn_t3: "consignee", etrn_t4: "carrier",
    },
    warnings: [
      "Нужна складская расписка с указанием склада, даты приёма и состояния груза.",
    ],
  },
  {
    type: "intercompany_own_transport",
    title: "Межскладское перемещение своим транспортом",
    short: "Перемещение между складами одной компании.",
    requires_forwarder: false,
    default_possession_mode: "unknown",
    cargo_holder_role: "shipper",
    participants: ["shipper", "driver", "consignee"],
    required_documents: ["electronic_waybill"],
    signing_plan: {
      electronic_transport_order_signers: [],
      etrn_t1: "shipper", etrn_t2: "driver", etrn_t3: "consignee", etrn_t4: "driver",
    },
    warnings: ["Электронный путевой лист — заготовка."],
  },
  {
    type: "intercompany_attracted_transport",
    title: "Межскладское перемещение с привлечённым транспортом",
    short: "Перемещение между своими складами силами стороннего перевозчика.",
    requires_forwarder: false,
    default_possession_mode: "unknown",
    cargo_holder_role: "shipper",
    participants: ["shipper", "carrier", "driver", "consignee"],
    required_documents: ["electronic_transport_order", "etrn"],
    signing_plan: {
      electronic_transport_order_signers: ["shipper", "carrier"],
      etrn_t1: "shipper", etrn_t2: "carrier", etrn_t3: "consignee", etrn_t4: "carrier",
    },
    warnings: [],
  },
  {
    type: "pickup_own_transport",
    title: "Самовывоз собственным транспортом",
    short: "Покупатель забирает груз сам.",
    requires_forwarder: false,
    default_possession_mode: "unknown",
    cargo_holder_role: "consignee",
    participants: ["shipper", "driver", "consignee"],
    required_documents: ["electronic_waybill"],
    signing_plan: {
      electronic_transport_order_signers: [],
      etrn_t1: "shipper", etrn_t2: "driver", etrn_t3: "consignee", etrn_t4: "driver",
    },
    warnings: ["Электронный путевой лист — заготовка."],
  },
  {
    type: "pickup_attracted_transport",
    title: "Самовывоз с привлечённым транспортом",
    short: "Покупатель привлекает перевозчика на самовывоз.",
    requires_forwarder: false,
    default_possession_mode: "unknown",
    cargo_holder_role: "consignee",
    participants: ["shipper", "carrier", "driver", "consignee"],
    required_documents: ["electronic_transport_order", "etrn"],
    signing_plan: {
      electronic_transport_order_signers: ["consignee", "carrier"],
      etrn_t1: "shipper", etrn_t2: "carrier", etrn_t3: "consignee", etrn_t4: "carrier",
    },
    warnings: [],
  },
];

export function getScenarioDef(type: EpdScenarioType): EpdScenarioDef | undefined {
  return EPD_SCENARIO_CATALOG.find(s => s.type === type);
}

export const EPD_SCENARIO_OPTIONS = EPD_SCENARIO_CATALOG.map(s => ({
  value: s.type, label: s.title, short: s.short,
}));

// Готовность перевозчика к ЭПД.
export type CarrierEpdReadinessStatus =
  | "not_ready" | "partial" | "ready"
  | "needs_edo_setup" | "needs_1c_setup"
  | "needs_signature" | "needs_mchd" | "needs_driver_app";

export const CARRIER_EPD_READINESS_LABEL: Record<CarrierEpdReadinessStatus, string> = {
  not_ready: "ЭПД не готов",
  partial: "ЭПД частично готов",
  ready: "ЭПД готов",
  needs_edo_setup: "Нужна настройка ЭДО",
  needs_1c_setup: "Нужна 1С/оператор",
  needs_signature: "Нужна подпись",
  needs_mchd: "Нужна МЧД",
  needs_driver_app: "Нужно приложение водителя",
};

export type GoslogStatus =
  | "unknown" | "needs_check" | "pending_application"
  | "included" | "not_found" | "rejected" | "error"
  | "manually_verified" | "expired_or_risk";

export const GOSLOG_STATUS_LABEL: Record<GoslogStatus, string> = {
  unknown: "Статус неизвестен",
  needs_check: "ГосЛог: проверить",
  pending_application: "ГосЛог: ожидает заявления",
  included: "ГосЛог ✓",
  not_found: "ГосЛог: не найден",
  rejected: "ГосЛог: отказ",
  error: "ГосЛог: ошибка",
  manually_verified: "ГосЛог: ручная проверка",
  expired_or_risk: "ГосЛог: просрочен/риск",
};

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPost, apiPatch } from "@/lib/api-client";
import {
  parseIncomingFreightText,
  type ParsedFreightFields,
} from "@/lib/dispatcher/freight-parse";
import { getVehicleBodyTypeLabel, VEHICLE_BODY_TYPES } from "@/lib/dispatcher/vehicle-options";
import { formatTons } from "@/lib/units";
import type { FreeVehicleRow } from "@/lib/dispatcher/api";

/* ------------------------------------------------------------------ */
/*  Локальные типы черновика                                          */
/* ------------------------------------------------------------------ */

type LoadMethod =
  | "top"
  | "side"
  | "rear"
  | "tent_off"
  | "crane"
  | "forklift"
  | "manual"
  | "unspecified";

const LOAD_METHOD_LABEL: Record<LoadMethod, string> = {
  top: "Верхняя",
  side: "Боковая",
  rear: "Задняя",
  tent_off: "Полная растентовка",
  crane: "Кран",
  forklift: "Погрузчик",
  manual: "Ручная",
  unspecified: "Не указано",
};

const LOAD_METHODS: LoadMethod[] = [
  "top", "side", "rear", "tent_off", "crane", "forklift", "manual", "unspecified",
];

const VAT_OPTIONS = [
  { value: "with", label: "С НДС" },
  { value: "without", label: "Без НДС" },
  { value: "cash", label: "Наличные" },
  { value: "card", label: "На карту" },
  { value: "agreed", label: "По договорённости" },
];

const BARGAIN_OPTIONS = [
  { value: "no", label: "Без торга" },
  { value: "yes", label: "Возможен торг" },
  { value: "request", label: "По запросу" },
];

const PAYMENT_OPTIONS = [
  { value: "on_unloading", label: "На выгрузке" },
  { value: "after_docs", label: "После документов" },
  { value: "delayed", label: "Отсрочка банковских дней" },
  { value: "prepayment", label: "Предоплата" },
  { value: "agreed", label: "По договорённости" },
];

interface CargoItem {
  cargo_name: string;
  weight_t: string;
  volume_m3: string;
  package_kind: string;
  packages_count: string;
  surcharge: boolean;
  body_type: string;
  temp_mode: string;
  comment: string;
}

interface RoutePoint {
  type: "load" | "unload" | "via";
  city: string;
  region: string;
  address: string;
  date: string;
  time: string;
  load_method: LoadMethod | "";
  comment: string;
}

interface CustomerContacts {
  company: string;
  ati_id: string;
  contact_name: string;
  phone1: string;
  phone2: string;
  email: string;
  comment: string;
}

interface RateInfo {
  rate: string;
  rate_tbd: boolean;
  rate_per_km: string;
  vat: string;
  bargain: string;
  payment: string;
  delay_days: string;
  direct_contract: boolean;
  comment: string;
}

function emptyCargo(): CargoItem {
  return {
    cargo_name: "",
    weight_t: "",
    volume_m3: "",
    package_kind: "",
    packages_count: "",
    surcharge: false,
    body_type: "",
    temp_mode: "",
    comment: "",
  };
}
function emptyPoint(type: RoutePoint["type"]): RoutePoint {
  return {
    type,
    city: "",
    region: "",
    address: "",
    date: "",
    time: "",
    load_method: "",
    comment: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface BuildTripOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: FreeVehicleRow;
}

export function BuildTripOfferDialog({ open, onOpenChange, vehicle }: BuildTripOfferDialogProps) {
  const qc = useQueryClient();
  const [sourceText, setSourceText] = useState("");
  const [parsedSnapshot, setParsedSnapshot] = useState<ParsedFreightFields | null>(null);

  const [cargos, setCargos] = useState<CargoItem[]>([emptyCargo()]);
  const [loadPoint, setLoadPoint] = useState<RoutePoint>(emptyPoint("load"));
  const [unloadPoint, setUnloadPoint] = useState<RoutePoint>(emptyPoint("unload"));
  const [extraPoints, setExtraPoints] = useState<RoutePoint[]>([]);
  const [rate, setRate] = useState<RateInfo>({
    rate: "",
    rate_tbd: false,
    rate_per_km: "",
    vat: "",
    bargain: "",
    payment: "",
    delay_days: "",
    direct_contract: false,
    comment: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [carrierRequestId, setCarrierRequestId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<CustomerContacts>({
    company: "",
    ati_id: "",
    contact_name: "",
    phone1: "",
    phone2: "",
    email: "",
    comment: "",
  });

  /* ----------------- Текстовый разбор ----------------- */

  function applyParsed(p: ParsedFreightFields) {
    setParsedSnapshot(p);
    setCargos((prev) => {
      const first = { ...(prev[0] ?? emptyCargo()) };
      if (p.cargo_name) first.cargo_name = p.cargo_name;
      if (p.weight_kg != null) first.weight_t = String(p.weight_kg / 1000);
      if (p.volume_m3 != null) first.volume_m3 = String(p.volume_m3);
      if (p.package_kind) first.package_kind = p.package_kind;
      if (p.packages_count != null) first.packages_count = String(p.packages_count);
      if (p.surcharge != null) first.surcharge = !!p.surcharge;
      if (p.body_type) first.body_type = p.body_type;
      return [first, ...prev.slice(1)];
    });
    setLoadPoint((lp) => ({
      ...lp,
      city: p.loading_city ?? lp.city,
      address: p.loading_address ?? lp.address,
      date: p.loading_date ?? lp.date,
      load_method: (p.load_methods?.[0] as LoadMethod | undefined) ?? lp.load_method,
    }));
    setUnloadPoint((up) => ({
      ...up,
      city: p.unloading_city ?? up.city,
      address: p.unloading_address ?? up.address,
      date: p.unloading_date ?? up.date,
    }));
    setRate((r) => ({
      ...r,
      rate: p.rate != null ? String(p.rate) : r.rate,
      rate_per_km: p.rate_per_km != null ? String(p.rate_per_km) : r.rate_per_km,
      vat: p.rate_vat ?? r.vat,
      bargain: p.bargain ?? r.bargain,
      payment: p.payment_type ?? r.payment,
      delay_days: p.payment_delay_days != null ? String(p.payment_delay_days) : r.delay_days,
      direct_contract: p.direct_contract ?? r.direct_contract,
    }));
    setContacts((c) => ({
      ...c,
      company: p.customer_name ?? c.company,
      ati_id: p.customer_ati_id ?? c.ati_id,
      contact_name: p.contact_name ?? c.contact_name,
      phone1: p.contact_phone ?? c.phone1,
      phone2: p.contact_phone2 ?? c.phone2,
      email: p.contact_email ?? c.email,
      comment: p.comment ?? c.comment,
    }));
  }

  interface ServerParsedPoint {
    kind: "loading" | "unloading";
    index: number;
    city: string | null;
    date: string | null;
    weight_kg: number | null;
    volume_m3: number | null;
    pallets: number | null;
    cargo_name: string | null;
    is_additional: boolean;
  }
  interface ServerParsed {
    loading_city: string | null;
    unloading_city: string | null;
    loading_date: string | null;
    unloading_date: string | null;
    weight_kg: number | null;
    volume_m3: number | null;
    pallets: number | null;
    rate_amount: number | null;
    cargo_name: string | null;
    body_type: string | null;
    points: ServerParsedPoint[];
    warnings: string[];
    hits: string[];
  }
  const [serverParsed, setServerParsed] = useState<ServerParsed | null>(null);
  const [parsing, setParsing] = useState(false);

  function applyServerParsed(p: ServerParsed) {
    setServerParsed(p);
    const compat: ParsedFreightFields = {
      cargo_name: p.cargo_name ?? null,
      weight_kg: p.weight_kg ?? null,
      volume_m3: p.volume_m3 ?? null,
      packages_count: p.pallets ?? null,
      loading_city: p.loading_city ?? null,
      loading_date: p.loading_date ?? null,
      unloading_city: p.unloading_city ?? null,
      unloading_date: p.unloading_date ?? null,
      body_type: p.body_type ?? null,
      rate: p.rate_amount ?? null,
    } as ParsedFreightFields;
    applyParsed(compat);

    // Заполнить доп. точки из server.points (вторая и далее загрузка/выгрузка)
    const loads = p.points.filter((x) => x.kind === "loading");
    const unloads = p.points.filter((x) => x.kind === "unloading");
    const extra: RoutePoint[] = [];
    loads.slice(1).forEach((pt) => {
      extra.push({ ...emptyPoint("load"), city: pt.city ?? "", date: pt.date ?? "" });
    });
    unloads.slice(1).forEach((pt) => {
      extra.push({ ...emptyPoint("unload"), city: pt.city ?? "", date: pt.date ?? "" });
    });
    if (extra.length > 0) setExtraPoints(extra);
  }

  async function onParseClick() {
    if (!sourceText.trim()) {
      toast.error("Вставьте текст груза");
      return;
    }
    setParsing(true);
    try {
      const resp = await apiPost<{ ok: boolean; parsed: ServerParsed }>(
        "/api/dispatcher/ai/parse-freight-text",
        { text: sourceText },
      );
      if (resp?.parsed) {
        applyServerParsed(resp.parsed);
        const hits = resp.parsed.hits?.length ?? 0;
        if (hits === 0) toast.warning("Ничего не распознано. Заполните вручную.");
        else toast.success(`Разобрано. Распознано: ${hits} полей`);
        return;
      }
    } catch (e) {
      // fallback: локальный парсер
      const res = parseIncomingFreightText(sourceText);
      if (res.has_any) {
        applyParsed(res.fields);
        toast.success("Разобрано (локально)");
      } else {
        toast.error("Не удалось разобрать текст", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    } finally {
      setParsing(false);
    }
  }

  /* ----------------- Итоги ----------------- */

  const totals = useMemo(() => {
    const weight = cargos.reduce((s, c) => s + (Number(c.weight_t.replace(",", ".")) || 0), 0);
    const volume = cargos.reduce((s, c) => s + (Number(c.volume_m3.replace(",", ".")) || 0), 0);
    const rateNum = Number(rate.rate.replace(",", ".")) || 0;
    const route = `${loadPoint.city || "—"} → ${unloadPoint.city || "—"}`;
    return { weight, volume, rate: rateNum, route };
  }, [cargos, rate.rate, loadPoint.city, unloadPoint.city]);

  /* ----------------- Сохранение ----------------- */

  // Маппинг значений UI оплаты на канонические enum-значения схемы.
  const PAYMENT_MAP: Record<string, string | null> = {
    on_unloading: "on_unload",
    after_docs: "deferred",
    delayed: "deferred",
    prepayment: "advance",
    agreed: "other",
  };

  const nz = (s: string | null | undefined): string | null => {
    const v = (s ?? "").toString().trim();
    return v === "" ? null : v;
  };
  const nnum = (s: string | null | undefined): number | null => {
    const v = nz(s);
    if (v == null) return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  // Идентификатор сохранённого черновика — пока null, кнопка отправки
  // перевозчику покажет понятную причину блокировки.
  const [draftId, setDraftId] = useState<string | null>(null);

  // Причина, по которой нельзя сейчас отправлять перевозчику.
  // Возвращает null, если всё ок.
  const blockReason = useMemo<string | null>(() => {
    if (!vehicle.id) return "Не выбрана машина";
    if (!vehicle.carrier?.id) return "У машины не указан перевозчик";
    if (!nz(loadPoint.city)) return "Не заполнен город загрузки";
    if (!nz(unloadPoint.city)) return "Не заполнен город выгрузки";
    if (!nz(loadPoint.date)) return "Не указана дата загрузки";
    const hasCargo =
      nz(cargos[0]?.cargo_name) ||
      nnum(cargos[0]?.weight_t) ||
      nnum(cargos[0]?.volume_m3);
    if (!hasCargo) return "Опишите груз: название, вес или объём";
    if (!rate.rate_tbd && !nnum(rate.rate)) return "Укажите ставку или отметьте «Ставка уточняется»";
    return null;
  }, [
    vehicle.id,
    vehicle.carrier?.id,
    loadPoint.city,
    loadPoint.date,
    unloadPoint.city,
    rate.rate,
    rate.rate_tbd,
    cargos,
  ]);

  function buildPayload() {
    const points: RoutePoint[] = [loadPoint, ...extraPoints, unloadPoint];
    const firstCargo = cargos[0];
    const weightT = nnum(firstCargo?.weight_t);
    return {
      title: nz(`${loadPoint.city || ""} → ${unloadPoint.city || ""}`.replace(/^ → $/, "")),
      loading_city: nz(loadPoint.city),
      loading_date: nz(loadPoint.date),
      unloading_city: nz(unloadPoint.city),
      unloading_date: nz(unloadPoint.date),
      cargo_name: nz(firstCargo?.cargo_name),
      weight_kg: weightT != null ? Math.round(weightT * 1000) : null,
      volume_m3: nnum(firstCargo?.volume_m3),
      body_type: nz(firstCargo?.body_type),
      load_methods: loadPoint.load_method ? [loadPoint.load_method] : [],
      rate: nnum(rate.rate),
      payment_type: rate.payment ? (PAYMENT_MAP[rate.payment] ?? null) : null,
      payment_delay_days: nnum(rate.delay_days),
      contact_name: nz(contacts.contact_name),
      contact_phone: nz(contacts.phone1),
      comment: nz(rate.comment) ?? nz(contacts.comment),
      customer_name: nz(contacts.company),
      customer_phone: nz(contacts.phone1),
      customer_email: nz(contacts.email),
      freight_kind: "main" as const,
      dispatcher_status: "new" as const,
      assigned_vehicle_ext_id: vehicle.id,
      assigned_carrier_ext_id: vehicle.carrier?.id ?? null,
      assigned_driver_ext_id: vehicle.driver?.id ?? null,
      source_text: nz(sourceText),
      parsed_payload: parsedSnapshot ?? null,
      cargo_items: cargos,
      route_points: points,
      offer_status: "draft",
    };
  }

  const saveDraft = useMutation({
    mutationFn: async () => {
      return apiPost<{ row: { id: string } }>(
        "/api/dispatcher/freights",
        buildPayload(),
      );
    },
    onSuccess: (resp) => {
      setDraftId(resp.row.id);
      toast.success("Черновик сохранён");
      qc.invalidateQueries({ queryKey: ["dispatcher-freights"] });
      qc.invalidateQueries({ queryKey: ["vehicle-freights", vehicle.id] });
    },
    onError: (e: unknown) =>
      toast.error("Не удалось сохранить черновик. Проверьте маршрут и ставку.", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const sendOffer = useMutation({
    mutationFn: async () => {
      if (carrierRequestId) {
        return { id: carrierRequestId, reused: true as const };
      }
      let id = draftId;
      if (!id) {
        const created = await apiPost<{ row: { id: string; carrier_request_id?: string | null } }>(
          "/api/dispatcher/freights",
          buildPayload(),
        );
        id = created.row.id;
        setDraftId(id);
        if (created.row.carrier_request_id) {
          setCarrierRequestId(created.row.carrier_request_id);
          return { id: created.row.carrier_request_id, reused: true as const };
        }
      }
      const carrierId = vehicle.carrier?.id;
      if (!carrierId) throw new Error("У машины не указан перевозчик");
      const created = await apiPost<{ row: { id: string } }>(
        `/api/dispatcher/freights/${id}/create-carrier-request`,
        {
          dispatcher_carrier_ext_id: carrierId,
          dispatcher_vehicle_ext_id: vehicle.id,
          dispatcher_driver_ext_id: vehicle.driver?.id ?? null,
        },
      );
      setCarrierRequestId(created.row.id);
      // Перевод в sent — карточка появится у перевозчика.
      await apiPatch(`/api/dispatcher/carrier-requests/${created.row.id}`, {
        request_status: "sent",
      });
      return { id: created.row.id, reused: false as const };
    },
    onSuccess: (res) => {
      toast.success(res.reused ? "Предложение уже было отправлено" : "Предложение отправлено перевозчику");
      qc.invalidateQueries({ queryKey: ["dispatcher-freights"] });
      qc.invalidateQueries({ queryKey: ["vehicle-freights", vehicle.id] });
      qc.invalidateQueries({ queryKey: ["carrier-requests"] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error("Не удалось отправить предложение", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  /* ----------------- Render ----------------- */

  const vehTitle = `${vehicle.vehicle_kind ?? "Машина"}${
    vehicle.body_type ? ` · ${getVehicleBodyTypeLabel(vehicle.body_type)}` : ""
  }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-screen h-[100dvh] max-w-none rounded-none p-0 sm:max-w-3xl sm:h-auto sm:max-h-[92dvh] sm:rounded-lg flex flex-col gap-0 overflow-hidden"
      >
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4 space-y-4"
          style={{ touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <DialogHeader>
            <DialogTitle>Собрать предложение рейса</DialogTitle>
            <DialogDescription>
              Машина: {vehTitle} · {vehicle.current_city ?? vehicle.home_city ?? "—"}
            </DialogDescription>
          </DialogHeader>

          {/* Транспорт / водитель / перевозчик — read-only */}
          <Section title="Данные машины">
            <KV label="Машина" v={vehTitle} />
            <KV label="Тоннаж" v={formatTons(vehicle.payload_kg)} />
            <KV label="Объём" v={vehicle.volume_m3 != null ? `${vehicle.volume_m3} м³` : "—"} />
            <KV label="Город машины" v={vehicle.current_city ?? vehicle.home_city ?? "—"} />
            <KV label="Готов в" v={vehicle.ready_to_cities?.join(", ") || "—"} />
            <KV label="Перевозчик" v={vehicle.carrier?.name ?? "Не указан"} />
            <KV label="ИНН" v={vehicle.carrier?.inn ?? "—"} />
            <KV label="Водитель" v={vehicle.driver?.full_name ?? "Не указан"} />
            <KV
              label="Тел. водителя"
              v={vehicle.driver?.phone ?? vehicle.carrier?.phone ?? "—"}
            />
          </Section>

          {/* Парсер */}
          <Section title="Вставьте текст груза">
            <Textarea
              rows={6}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Например: «Погрузка в Краснодаре 2 т 16 м³ 16 числа, потом забрать в Ростове 2 палеты 300 кг и отвезти в Москву первый, второй в Домодедово»"
              className="text-sm"
            />
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => void onParseClick()} variant="secondary" size="sm" disabled={parsing}>
                <Wand2 className="mr-1 h-4 w-4" /> {parsing ? "Разбираем…" : "Разобрать текст"}
              </Button>
            </div>
            {serverParsed && (
              <div className="mt-3 space-y-1 rounded border border-border bg-muted/40 p-2 text-xs">
                <div className="font-semibold">Распознано — проверьте:</div>
                {serverParsed.points
                  .filter((p) => p.kind === "loading")
                  .map((p, i) => (
                    <div key={`l${i}`}>
                      Загрузка {p.index}: <strong>{p.city ?? "город?"}</strong>
                      {p.weight_kg ? `, ${(p.weight_kg / 1000).toLocaleString("ru-RU")} т` : ""}
                      {p.volume_m3 ? `, ${p.volume_m3} м³` : ""}
                      {p.pallets ? `, ${p.pallets} пал.` : ""}
                      {p.date ? `, ${p.date}` : ""}
                      {p.is_additional ? " (догруз)" : ""}
                    </div>
                  ))}
                {serverParsed.points
                  .filter((p) => p.kind === "unloading")
                  .map((p, i) => (
                    <div key={`u${i}`}>
                      Выгрузка {p.index}: <strong>{p.city ?? "город?"}</strong>
                      {p.date ? `, ${p.date}` : ""}
                    </div>
                  ))}
                {serverParsed.warnings.length > 0 && (
                  <div className="pt-1 text-amber-700">
                    Нужно проверить: {serverParsed.warnings.join("; ")}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Cargos */}
          {cargos.map((c, i) => (
            <Section
              key={i}
              title={i === 0 ? "Груз №1" : `Груз №${i + 1}`}
              right={
                i > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCargos((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null
              }
            >
              <CargoFields
                value={c}
                onChange={(next) =>
                  setCargos((arr) => arr.map((x, j) => (j === i ? next : x)))
                }
              />
            </Section>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCargos((arr) => [...arr, emptyCargo()])}
          >
            <Plus className="mr-1 h-4 w-4" /> Добавить груз
          </Button>

          {/* Loading */}
          <Section title="Загрузка">
            <PointFields value={loadPoint} onChange={setLoadPoint} kind="load" />
          </Section>

          {/* Extra points */}
          {extraPoints.map((p, i) => (
            <Section
              key={i}
              title={
                p.type === "load"
                  ? `Доп. точка загрузки`
                  : p.type === "unload"
                    ? `Доп. точка выгрузки`
                    : `Точка маршрута`
              }
              right={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setExtraPoints((arr) => arr.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              }
            >
              <PointFields
                value={p}
                onChange={(next) =>
                  setExtraPoints((arr) => arr.map((x, j) => (j === i ? next : x)))
                }
                kind={p.type}
              />
            </Section>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setExtraPoints((arr) => [...arr, emptyPoint("load")])}
            >
              <Plus className="mr-1 h-4 w-4" /> точка загрузки
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setExtraPoints((arr) => [...arr, emptyPoint("unload")])}
            >
              <Plus className="mr-1 h-4 w-4" /> точка выгрузки
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setExtraPoints((arr) => [...arr, emptyPoint("via")])}
            >
              <Plus className="mr-1 h-4 w-4" /> ехать через
            </Button>
          </div>

          {/* Unloading */}
          <Section title="Выгрузка">
            <PointFields value={unloadPoint} onChange={setUnloadPoint} kind="unload" />
          </Section>

          {/* Rate */}
          <Section title="Ставка и оплата">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ставка, руб">
                <Input
                  inputMode="decimal"
                  value={rate.rate}
                  onChange={(e) => setRate({ ...rate, rate: e.target.value })}
                  placeholder="20000"
                  className="h-10"
                />
              </Field>
              <Field label="Ставка руб/км">
                <Input
                  inputMode="decimal"
                  value={rate.rate_per_km}
                  onChange={(e) => setRate({ ...rate, rate_per_km: e.target.value })}
                  placeholder="20,5"
                  className="h-10"
                />
              </Field>
              <Field label="НДС / оплата">
                <Select value={rate.vat} onValueChange={(v) => setRate({ ...rate, vat: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Торг">
                <Select value={rate.bargain} onValueChange={(v) => setRate({ ...rate, bargain: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {BARGAIN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Условия оплаты">
                <Select value={rate.payment} onValueChange={(v) => setRate({ ...rate, payment: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Банковских дней">
                <Input
                  inputMode="numeric"
                  value={rate.delay_days}
                  onChange={(e) => setRate({ ...rate, delay_days: e.target.value })}
                  className="h-10"
                />
              </Field>
              <div className="col-span-2 flex items-center gap-2">
                <Checkbox
                  id="direct"
                  checked={rate.direct_contract}
                  onCheckedChange={(v) => setRate({ ...rate, direct_contract: v === true })}
                />
                <Label htmlFor="direct" className="text-sm">
                  Прямой договор
                </Label>
              </div>
              <div className="col-span-2">
                <Field label="Комментарий по оплате">
                  <Textarea
                    rows={2}
                    value={rate.comment}
                    onChange={(e) => setRate({ ...rate, comment: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Contacts */}
          <Section title="Контакты заказчика">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Компания">
                <Input
                  value={contacts.company}
                  onChange={(e) => setContacts({ ...contacts, company: e.target.value })}
                  className="h-10"
                />
              </Field>
              <Field label="ATI код / ID">
                <Input
                  value={contacts.ati_id}
                  onChange={(e) => setContacts({ ...contacts, ati_id: e.target.value })}
                  className="h-10"
                />
              </Field>
              <Field label="Контактное лицо">
                <Input
                  value={contacts.contact_name}
                  onChange={(e) => setContacts({ ...contacts, contact_name: e.target.value })}
                  className="h-10"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={contacts.email}
                  onChange={(e) => setContacts({ ...contacts, email: e.target.value })}
                  className="h-10"
                />
              </Field>
              <Field label="Телефон 1">
                <Input
                  type="tel"
                  value={contacts.phone1}
                  onChange={(e) => setContacts({ ...contacts, phone1: e.target.value })}
                  className="h-10"
                />
              </Field>
              <Field label="Телефон 2">
                <Input
                  type="tel"
                  value={contacts.phone2}
                  onChange={(e) => setContacts({ ...contacts, phone2: e.target.value })}
                  className="h-10"
                />
              </Field>
              <div className="col-span-2">
                <Field label="Комментарий">
                  <Textarea
                    rows={2}
                    value={contacts.comment}
                    onChange={(e) => setContacts({ ...contacts, comment: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Totals */}
          <Section title="Итог">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                Общий вес: <strong>{totals.weight.toLocaleString("ru-RU")} т</strong>
              </div>
              <div>
                Общий объём: <strong>{totals.volume.toLocaleString("ru-RU")} м³</strong>
              </div>
              <div>
                Ставка: <strong>{totals.rate.toLocaleString("ru-RU")} ₽</strong>
              </div>
              <div>
                Маршрут: <strong>{totals.route}</strong>
              </div>
              <div className="col-span-2 text-xs text-muted-foreground">
                Предложение будет сохранено как черновик и привязано к машине{" "}
                <strong>{vehTitle}</strong>.
              </div>
            </div>
          </Section>
        </div>

        <DialogFooter
          className="flex-col gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:flex-row sm:flex-wrap"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {blockReason ? (
            <div className="w-full text-xs text-amber-600 sm:order-first">
              {blockReason}
            </div>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="default"
            onClick={() => saveDraft.mutate()}
            disabled={saveDraft.isPending || sendOffer.isPending}
          >
            {saveDraft.isPending ? "Сохранение…" : draftId ? "Обновить черновик" : "Сохранить черновик"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (blockReason) {
                toast.warning(blockReason);
                return;
              }
              sendOffer.mutate();
            }}
            disabled={sendOffer.isPending || saveDraft.isPending || blockReason !== null}
            title={blockReason ?? "Отправить предложение перевозчику"}
          >
            {sendOffer.isPending ? "Отправка…" : "Отправить предложение перевозчику"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Подкомпоненты                                                      */
/* ------------------------------------------------------------------ */

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        {right}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KV({ label, v }: { label: string; v: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{v && v !== "" ? v : "—"}</span>
    </div>
  );
}

function CargoFields({
  value,
  onChange,
}: {
  value: CargoItem;
  onChange: (v: CargoItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <Field label="Название груза">
          <Input
            value={value.cargo_name}
            onChange={(e) => onChange({ ...value, cargo_name: e.target.value })}
            className="h-10"
          />
        </Field>
      </div>
      <Field label="Вес, т">
        <Input
          inputMode="decimal"
          value={value.weight_t}
          onChange={(e) => onChange({ ...value, weight_t: e.target.value })}
          placeholder="1,5"
          className="h-10"
        />
      </Field>
      <Field label="Объём, м³">
        <Input
          inputMode="decimal"
          value={value.volume_m3}
          onChange={(e) => onChange({ ...value, volume_m3: e.target.value })}
          placeholder="12"
          className="h-10"
        />
      </Field>
      <Field label="Упаковка">
        <Input
          value={value.package_kind}
          onChange={(e) => onChange({ ...value, package_kind: e.target.value })}
          placeholder="палеты"
          className="h-10"
        />
      </Field>
      <Field label="Кол-во мест">
        <Input
          inputMode="numeric"
          value={value.packages_count}
          onChange={(e) => onChange({ ...value, packages_count: e.target.value })}
          className="h-10"
        />
      </Field>
      <Field label="Тип кузова">
        <Select
          value={value.body_type}
          onValueChange={(v) => onChange({ ...value, body_type: v })}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {VEHICLE_BODY_TYPES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Температурный режим">
        <Input
          value={value.temp_mode}
          onChange={(e) => onChange({ ...value, temp_mode: e.target.value })}
          placeholder="+2…+6"
          className="h-10"
        />
      </Field>
      <div className="col-span-2 flex items-center gap-2">
        <Checkbox
          id={`surcharge-${value.cargo_name}`}
          checked={value.surcharge}
          onCheckedChange={(v) => onChange({ ...value, surcharge: v === true })}
        />
        <Label className="text-sm">Возможен догруз</Label>
      </div>
      <div className="col-span-2">
        <Field label="Комментарий">
          <Textarea
            rows={2}
            value={value.comment}
            onChange={(e) => onChange({ ...value, comment: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function PointFields({
  value,
  onChange,
  kind,
}: {
  value: RoutePoint;
  onChange: (v: RoutePoint) => void;
  kind: RoutePoint["type"];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Город">
        <Input
          value={value.city}
          onChange={(e) => onChange({ ...value, city: e.target.value })}
          className="h-10"
        />
      </Field>
      <Field label="Регион">
        <Input
          value={value.region}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
          className="h-10"
        />
      </Field>
      <div className="col-span-2">
        <Field label="Адрес">
          <Input
            value={value.address}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            className="h-10"
          />
        </Field>
      </div>
      <Field label="Дата / период">
        <Input
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          placeholder="2026-06-17"
          className="h-10"
        />
      </Field>
      <Field label="Время">
        <Input
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          placeholder="8:00-23:00"
          className="h-10"
        />
      </Field>
      {kind !== "via" ? (
        <div className="col-span-2">
          <Field
            label={kind === "load" ? "Способ загрузки" : "Способ выгрузки"}
          >
            <Select
              value={value.load_method || ""}
              onValueChange={(v) => onChange({ ...value, load_method: v as LoadMethod })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {LOAD_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {LOAD_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}
      <div className="col-span-2">
        <Field label="Комментарий">
          <Textarea
            rows={2}
            value={value.comment}
            onChange={(e) => onChange({ ...value, comment: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

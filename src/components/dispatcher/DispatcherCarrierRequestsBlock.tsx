import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Copy, Loader2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPatch, apiPost } from "@/lib/api-client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CARRIER_REQUEST_PAYMENT_TYPES,
  CARRIER_REQUEST_PAYMENT_TYPE_LABELS,
  CARRIER_REQUEST_STATUS_LABELS,
  type CarrierRequestPaymentType,
  type CarrierRequestStatus,
} from "@/lib/dispatcher/statuses";
import {
  buildCarrierRequestMessage,
  type CarrierRequestPayload,
} from "@/lib/dispatcher/carrier-request";
import { computeCommissionAmount } from "@/lib/dispatcher/carrier-request-schemas";

interface RequestRow {
  id: string;
  dispatcher_carrier_ext_id: string;
  dispatcher_driver_ext_id: string | null;
  dispatcher_vehicle_ext_id: string | null;
  dispatcher_deal_id: string | null;
  request_number: string | null;
  cargo_name: string | null;
  loading_city: string | null;
  loading_address: string | null;
  loading_date: string | null;
  unloading_city: string | null;
  unloading_address: string | null;
  unloading_date: string | null;
  rate_amount: number | string | null;
  rate_currency: string | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;
  dispatcher_comment: string | null;
  carrier_comment: string | null;
  request_status: string;
  created_at: string;
}

interface DriverOption {
  id: string;
  full_name: string | null;
  dispatcher_carrier_ext_id: string | null;
}
interface VehicleOption {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  dispatcher_carrier_ext_id: string | null;
}

interface Props {
  carrierExtId: string;
  carrierName?: string | null;
  initialDriverId?: string | null;
  initialVehicleId?: string | null;
  initialDealId?: string | null;
}

const EMPTY_FORM = {
  cargo_name: "",
  loading_city: "",
  loading_address: "",
  loading_date: "",
  unloading_city: "",
  unloading_address: "",
  unloading_date: "",
  customer_name: "",
  customer_contact: "",
  customer_email: "",
  customer_phone: "",
  rate_amount: "",
  payment_type: "" as "" | CarrierRequestPaymentType,
  payment_delay_days: "",
  commission_percent: "5",
  dispatcher_comment: "",
};

export function DispatcherCarrierRequestsBlock({
  carrierExtId,
  carrierName,
  initialDriverId = null,
  initialVehicleId = null,
  initialDealId = null,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(initialDriverId);
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicleId);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [previewText, setPreviewText] = useState<string>("");

  const driversQ = useQuery({
    queryKey: ["dcrb", "drivers", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: DriverOption[] }>(
        `/api/dispatcher/drivers?carrier_id=${carrierExtId}&limit=100`,
        10000,
      ),
    enabled: !!carrierExtId,
  });
  const vehiclesQ = useQuery({
    queryKey: ["dcrb", "vehicles", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: VehicleOption[] }>(
        `/api/dispatcher/vehicles?carrier_id=${carrierExtId}&limit=100`,
        10000,
      ),
    enabled: !!carrierExtId,
  });

  const listQ = useQuery({
    queryKey: ["dcrb", "list", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: RequestRow[] }>(
        `/api/dispatcher/carrier-requests?carrier_id=${carrierExtId}&limit=20`,
        10000,
      ),
    enabled: !!carrierExtId,
  });

  const drivers = driversQ.data?.rows ?? [];
  const vehicles = vehiclesQ.data?.rows ?? [];
  const rows = listQ.data?.rows ?? [];

  const driverNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivers) m.set(d.id, d.full_name ?? d.id.slice(0, 8));
    return m;
  }, [drivers]);
  const vehicleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles)
      m.set(
        v.id,
        [v.vehicle_kind, v.body_type].filter(Boolean).join(" / ") || v.id.slice(0, 8),
      );
    return m;
  }, [vehicles]);

  const rateNum = form.rate_amount ? Number(form.rate_amount) : null;
  const pctNum = form.commission_percent ? Number(form.commission_percent) : 5;
  const commissionAmount = computeCommissionAmount(rateNum, pctNum);

  function buildPayload(status: CarrierRequestStatus): CarrierRequestPayload & {
    dispatcher_carrier_ext_id: string;
    dispatcher_driver_ext_id: string | null;
    dispatcher_vehicle_ext_id: string | null;
    dispatcher_deal_id: string | null;
    customer_name: string | null;
    customer_contact: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    request_status: CarrierRequestStatus;
  } {
    return {
      dispatcher_carrier_ext_id: carrierExtId,
      dispatcher_driver_ext_id: driverId,
      dispatcher_vehicle_ext_id: vehicleId,
      dispatcher_deal_id: initialDealId,
      request_number: null,
      cargo_name: form.cargo_name || null,
      loading_city: form.loading_city || null,
      loading_address: form.loading_address || null,
      loading_date: form.loading_date || null,
      unloading_city: form.unloading_city || null,
      unloading_address: form.unloading_address || null,
      unloading_date: form.unloading_date || null,
      customer_name: form.customer_name || null,
      customer_contact: form.customer_contact || null,
      customer_email: form.customer_email || null,
      customer_phone: form.customer_phone || null,
      rate_amount: rateNum,
      rate_currency: "RUB",
      payment_type: form.payment_type || null,
      payment_delay_days: form.payment_delay_days ? Number(form.payment_delay_days) : null,
      commission_percent: pctNum,
      commission_amount: commissionAmount,
      terms_text: null,
      dispatcher_comment: form.dispatcher_comment || null,
      request_status: status,
      carrier_name: carrierName ?? null,
      driver_name: driverId ? driverNameById.get(driverId) ?? null : null,
      vehicle_name: vehicleId ? vehicleNameById.get(vehicleId) ?? null : null,
    };
  }

  function refreshPreview(status: CarrierRequestStatus) {
    setPreviewText(buildCarrierRequestMessage(buildPayload(status)));
  }

  const createMut = useMutation({
    mutationFn: async (status: CarrierRequestStatus) => {
      const payload = buildPayload(status);
      return apiPost<{ row: RequestRow }>("/api/dispatcher/carrier-requests", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dcrb", "list", carrierExtId] });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      toast.success("Заявка сохранена");
    },
    onError: (e: unknown) =>
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const markSentMut = useMutation({
    mutationFn: async (id: string) =>
      apiPatch<{ row: RequestRow }>(`/api/dispatcher/carrier-requests/${id}`, {
        request_status: "sent",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dcrb", "list", carrierExtId] });
      toast.success("Отмечено как отправлено");
    },
  });

  const createDealMut = useMutation({
    mutationFn: async (id: string) =>
      apiPost<{ row: { id: string; deal_number: string | null }; already_linked: boolean }>(
        `/api/dispatcher/carrier-requests/${id}/create-deal`,
        {},
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["dcrb", "list", carrierExtId] });
      toast.success(
        res.already_linked
          ? `Сделка уже связана: ${res.row.deal_number ?? res.row.id.slice(0, 8)}`
          : `Создана сделка ${res.row.deal_number ?? res.row.id.slice(0, 8)}`,
      );
    },
    onError: (e: unknown) =>
      toast.error("Не удалось создать сделку", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const linkDealMut = useMutation({
    mutationFn: async (vars: { id: string; deal_id: string }) =>
      apiPost<{ row: unknown; deal: { id: string; deal_number: string | null } }>(
        `/api/dispatcher/carrier-requests/${vars.id}/link-deal`,
        { deal_id: vars.deal_id },
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["dcrb", "list", carrierExtId] });
      toast.success(`Связано со сделкой ${res.deal.deal_number ?? res.deal.id.slice(0, 8)}`);
    },
    onError: (e: unknown) =>
      toast.error("Не удалось связать", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const createTasksMut = useMutation({
    mutationFn: async (id: string) =>
      apiPost<{ rows: unknown[]; total: number }>(
        `/api/dispatcher/carrier-requests/${id}/create-tasks`,
        {},
      ),
    onSuccess: (res) => toast.success(`Создано задач: ${res.total}`),
    onError: (e: unknown) =>
      toast.error("Не удалось создать задачи", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  async function copyText() {
    if (!previewText) {
      refreshPreview("draft");
    }
    try {
      const text = previewText || buildCarrierRequestMessage(buildPayload("draft"));
      await navigator.clipboard.writeText(text);
      toast.success("Текст скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          <span className="text-sm font-semibold">Заявки перевозчику</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {open ? "Свернуть" : "Создать заявку"}
        </Button>
      </div>

      {open && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Водитель</Label>
              <Select
                value={driverId ?? "_none"}
                onValueChange={(v) => setDriverId(v === "_none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Не выбран</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0,8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Транспорт</Label>
              <Select
                value={vehicleId ?? "_none"}
                onValueChange={(v) => setVehicleId(v === "_none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Не выбран</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {[v.vehicle_kind, v.body_type].filter(Boolean).join(" / ") || v.id.slice(0,8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Груз</Label>
              <Input value={form.cargo_name} onChange={(e) => setForm({ ...form, cargo_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Город загрузки</Label>
              <Input value={form.loading_city} onChange={(e) => setForm({ ...form, loading_city: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Дата загрузки</Label>
              <Input type="date" value={form.loading_date} onChange={(e) => setForm({ ...form, loading_date: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Адрес загрузки</Label>
              <Input value={form.loading_address} onChange={(e) => setForm({ ...form, loading_address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Город выгрузки</Label>
              <Input value={form.unloading_city} onChange={(e) => setForm({ ...form, unloading_city: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Дата выгрузки</Label>
              <Input type="date" value={form.unloading_date} onChange={(e) => setForm({ ...form, unloading_date: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Адрес выгрузки</Label>
              <Input value={form.unloading_address} onChange={(e) => setForm({ ...form, unloading_address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ставка, ₽</Label>
              <Input
                type="number"
                value={form.rate_amount}
                onChange={(e) => setForm({ ...form, rate_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Тип оплаты</Label>
              <Select
                value={form.payment_type || "_none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    payment_type: v === "_none" ? "" : (v as CarrierRequestPaymentType),
                  })
                }
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {CARRIER_REQUEST_PAYMENT_TYPES.map((p) => (
                    <SelectItem key={p} value={p}>{CARRIER_REQUEST_PAYMENT_TYPE_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Отсрочка, дн.</Label>
              <Input
                type="number"
                value={form.payment_delay_days}
                onChange={(e) => setForm({ ...form, payment_delay_days: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Комиссия диспетчера, %</Label>
              <Input
                type="number"
                value={form.commission_percent}
                onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Заказчик — имя</Label>
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Заказчик — телефон</Label>
              <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Заказчик — email</Label>
              <Input value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Комментарий диспетчера</Label>
              <Textarea
                value={form.dispatcher_comment}
                onChange={(e) => setForm({ ...form, dispatcher_comment: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Расчёт комиссии: {commissionAmount == null ? "—" : `${commissionAmount} ₽`} ({pctNum}% от ставки)
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" onClick={() => refreshPreview("draft")}>
              Сформировать текст
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={copyText}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Скопировать
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => createMut.mutate("draft")}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Сохранить черновик
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={() => createMut.mutate("sent")}
              disabled={createMut.isPending}
            >
              <Send className="mr-1 h-3.5 w-3.5" /> Создать и отметить отправленной
            </Button>
          </div>

          {previewText && (
            <Textarea
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              rows={14}
              className="font-mono text-xs"
            />
          )}
        </div>
      )}

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">История заявок</div>
        {listQ.isLoading ? (
          <div className="text-xs text-muted-foreground">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">Пока пусто</div>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {CARRIER_REQUEST_STATUS_LABELS[r.request_status as CarrierRequestStatus] ??
                        r.request_status}
                    </Badge>
                    <span className="font-medium">{r.request_number ?? r.id.slice(0, 8)}</span>
                    <span>{r.cargo_name ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {(r.loading_city ?? "—") + " → " + (r.unloading_city ?? "—")}
                    </span>
                    {r.rate_amount != null && (
                      <span>{r.rate_amount} {r.rate_currency ?? "RUB"}</span>
                    )}
                  </div>
                  {r.request_status === "draft" && (
                    <Button size="sm" variant="ghost" onClick={() => markSentMut.mutate(r.id)}>
                      Отметить отправленной
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

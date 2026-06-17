import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Loader2, ChevronDown, ChevronUp, Mail, BellRing, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { SendShipperEmailDialog } from "@/components/dispatcher/SendShipperEmailDialog";
import { startLoudRing, stopLoudRing } from "@/lib/notifications/loud-ring";

interface FreightLite {
  id: string;
  cargo_name: string | null;
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  rate_amount: number | null;
}

interface AcceptedOfferRow {
  id: string;
  request_number: string | null;
  request_status: string;
  dispatcher_carrier_ext_id: string | null;
  dispatcher_driver_ext_id: string | null;
  dispatcher_vehicle_ext_id: string | null;
  dispatcher_deal_id: string | null;
  cargo_name: string | null;
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  rate_amount: number | null;
  rate_currency: string | null;
  commission_amount: number | null;
  commission_percent: number | null;
  payout_amount: number | null;
  carrier_comment: string | null;
  dispatcher_comment: string | null;
  responded_at: string | null;
  created_at: string;
  carrier: { id: string; name: string | null; phone: string | null } | null;
  driver: { id: string; full_name: string | null; phone: string | null } | null;
  vehicle: {
    id: string;
    vehicle_kind: string | null;
    body_type: string | null;
    plate_number: string | null;
    payload_kg: number | null;
    volume_m3: number | null;
  } | null;
  freights: FreightLite[];
}

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";

export function AcceptedOffersBlock() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emailDialogRow, setEmailDialogRow] = useState<AcceptedOfferRow | null>(null);
  const [ringActive, setRingActive] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dispatcher-accepted-offers"],
    queryFn: () =>
      apiGetAuth<{ rows: AcceptedOfferRow[] }>("/api/dispatcher/carrier-requests/accepted"),
    refetchInterval: 60_000,
  });

  // Звук диспетчеру, когда перевозчик только что принял предложение.
  // Первая успешная загрузка только заполняет seenIds; новые id после этого
  // включают «громкий» сигнал до явной остановки или открытия письма.
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  useEffect(() => {
    if (!data?.rows) return;
    if (!initialized.current) {
      data.rows.forEach((r) => seenIds.current.add(r.id));
      initialized.current = true;
      return;
    }
    const fresh = data.rows.filter((r) => !seenIds.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenIds.current.add(r.id));
    const started = startLoudRing();
    if (started) setRingActive(true);
    const top = fresh[0];
    toast.info("Перевозчик принял предложение", {
      description: `${top.carrier?.name ?? "Перевозчик"}: ${top.loading_city ?? "—"} → ${top.unloading_city ?? "—"}`,
      duration: 8000,
    });
  }, [data]);
  useEffect(() => () => stopLoudRing(), []);

  const stopRing = () => {
    stopLoudRing();
    setRingActive(false);
  };

  const createDeal = useMutation({
    mutationFn: async (id: string) =>
      apiPost<{ row: { id: string; deal_number: string | null }; already_linked: boolean }>(
        `/api/dispatcher/carrier-requests/${id}/create-deal`,
      ),
    onSuccess: async (res, id) => {
      if (res.already_linked) {
        toast.info(`Сделка уже существует: ${res.row.deal_number ?? res.row.id}`);
      } else {
        toast.success(`Сделка создана: ${res.row.deal_number ?? res.row.id}`);
      }
      try {
        await apiPost(`/api/dispatcher/carrier-requests/${id}/create-tasks`);
      } catch (e) {
        toast.warning(
          e instanceof Error ? `Задачи: ${e.message}` : "Не удалось создать задачи",
        );
      }
      qc.invalidateQueries({ queryKey: ["dispatcher-accepted-offers"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Не удалось создать сделку"),
    onSettled: () => setBusyId(null),
  });

  const rows = data?.rows ?? [];

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Handshake className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Принятые предложения перевозчиков</h2>
        <Badge variant="secondary">{rows.length}</Badge>
        {ringActive ? (
          <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={stopRing}>
            <VolumeX className="h-3.5 w-3.5" /> Остановить сигнал
          </Button>
        ) : null}
      </div>

      {ringActive ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/50 bg-primary/10 p-2 text-sm">
          <BellRing className="h-4 w-4 animate-pulse text-primary" />
          <span className="font-medium">Новый принятый рейс — проверьте список ниже.</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          Нет принятых предложений, ожидающих создания сделки.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      № {r.request_number ?? r.id.slice(0, 8)} · {fmtDate(r.responded_at ?? r.created_at)}
                    </div>
                    <div className="mt-0.5 font-semibold">
                      {r.loading_city ?? "—"} → {r.unloading_city ?? "—"}
                    </div>
                  </div>
                  <Badge>Accepted</Badge>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  <div className="text-muted-foreground">Перевозчик</div>
                  <div className="truncate">{r.carrier?.name ?? "—"}</div>
                  <div className="text-muted-foreground">Водитель</div>
                  <div className="truncate">{r.driver?.full_name ?? "—"}</div>
                  <div className="text-muted-foreground">Транспорт</div>
                  <div className="truncate">
                    {r.vehicle?.vehicle_kind ?? "—"}
                    {r.vehicle?.body_type ? ` / ${r.vehicle.body_type}` : ""}
                    {r.vehicle?.plate_number ? ` · ${r.vehicle.plate_number}` : ""}
                  </div>
                  <div className="text-muted-foreground">Ставка</div>
                  <div>{fmtMoney(r.rate_amount)}</div>
                  <div className="text-muted-foreground">Комиссия</div>
                  <div>{fmtMoney(r.commission_amount)}</div>
                  <div className="text-muted-foreground">К выплате</div>
                  <div className="font-medium">{fmtMoney(r.payout_amount)}</div>
                  <div className="text-muted-foreground">Грузов</div>
                  <div>{r.freights.length}</div>
                </div>

                {r.carrier_comment ? (
                  <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                    <span className="text-muted-foreground">Комментарий перевозчика: </span>
                    {r.carrier_comment}
                  </div>
                ) : null}

                {expanded && r.freights.length > 0 ? (
                  <div className="mt-2 space-y-1 border-t pt-2 text-xs">
                    {r.freights.map((f) => (
                      <div key={f.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {f.cargo_name ?? "Груз"} · {f.loading_city ?? "—"} → {f.unloading_city ?? "—"}
                        </span>
                        <span className="text-muted-foreground">{fmtDate(f.loading_date)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === r.id || createDeal.isPending}
                    onClick={() => {
                      setBusyId(r.id);
                      createDeal.mutate(r.id);
                    }}
                  >
                    {busyId === r.id ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Создание…
                      </>
                    ) : (
                      "Создать сделку"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      stopRing();
                      setEmailDialogRow(r);
                    }}
                    disabled={!r.dispatcher_carrier_ext_id}
                  >
                    <Mail className="mr-1 h-3 w-3" /> Отправить грузовладельцу
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                  >
                    {expanded ? (
                      <>
                        <ChevronUp className="mr-1 h-3 w-3" /> Скрыть состав
                      </>
                    ) : (
                      <>
                        <ChevronDown className="mr-1 h-3 w-3" /> Открыть состав
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {emailDialogRow ? (
        <SendShipperEmailDialog
          open={!!emailDialogRow}
          onOpenChange={(o) => { if (!o) setEmailDialogRow(null); }}
          row={emailDialogRow}
        />
      ) : null}
    </section>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { apiPost } from "@/lib/api-client";
import type { FreightDTO } from "@/lib/dispatcher/types";

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "prepayment", label: "Предоплата" },
  { value: "on_loading", label: "По погрузке" },
  { value: "on_unloading", label: "По выгрузке" },
  { value: "delayed", label: "С отсрочкой" },
  { value: "mixed", label: "Смешанная" },
  { value: "other", label: "Другая" },
];

const fmt = (n: number) => n.toLocaleString("ru-RU");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  carrierExtId: string;
  driverExtId: string | null;
  freights: FreightDTO[];
}

export function BuildOfferDialog({
  open,
  onOpenChange,
  vehicleId,
  carrierExtId,
  driverExtId,
  freights,
}: Props) {
  const qc = useQueryClient();
  const [commissionPct, setCommissionPct] = useState<number>(5);
  const [paymentType, setPaymentType] = useState<string>("on_unloading");
  const [delayDays, setDelayDays] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  const totals = useMemo(() => {
    const rate = freights.reduce((s, f) => s + (Number(f.rate) || 0), 0);
    const weight = freights.reduce((s, f) => s + (Number(f.weight_kg) || 0), 0);
    const volume = freights.reduce((s, f) => s + (Number(f.volume_m3) || 0), 0);
    const commission = Math.round((rate * commissionPct) / 100);
    const payout = rate - commission;
    return { rate, weight, volume, commission, payout };
  }, [freights, commissionPct]);

  const sorted = useMemo(
    () =>
      [...freights].sort((a, b) =>
        String(a.loading_date ?? "").localeCompare(String(b.loading_date ?? "")),
      ),
    [freights],
  );

  const createMut = useMutation({
    mutationFn: () =>
      apiPost<{ row: { id: string; request_number: string | null } }>(
        "/api/dispatcher/freights/create-carrier-request-batch",
        {
          freight_ids: freights.map((f) => f.id),
          dispatcher_carrier_ext_id: carrierExtId,
          dispatcher_driver_ext_id: driverExtId,
          dispatcher_vehicle_ext_id: vehicleId,
          commission_percent: commissionPct,
          payment_type: paymentType,
          payment_delay_days:
            paymentType === "delayed" && delayDays ? Number(delayDays) : null,
          dispatcher_comment: comment || null,
        },
      ),
    onSuccess: (r) => {
      toast.success(`Предложение отправлено: ${r.row.request_number ?? r.row.id.slice(0, 8)}`);
      qc.invalidateQueries({ queryKey: ["vehicle-freights", vehicleId] });
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error("Не удалось создать предложение", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none p-0 sm:max-w-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4" style={{ touchAction: "pan-y" }}>
        <DialogHeader>
          <DialogTitle>Предложение рейса перевозчику</DialogTitle>
          <DialogDescription>
            Сборка одного предложения из {freights.length} груз(а). Перевозчик увидит
            предложение в своём кабинете.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded border border-border bg-muted/30 p-2">
            <div className="text-xs font-semibold text-muted-foreground">
              Маршрут
            </div>
            <div>
              {(sorted[0]?.loading_city ?? "—") + " → " +
                (sorted[sorted.length - 1]?.unloading_city ?? "—")}
            </div>
            <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
              {sorted.map((f, i) => (
                <li key={f.id}>
                  {i + 1}. {f.loading_city ?? "—"} → {f.unloading_city ?? "—"} ·{" "}
                  {f.loading_date ?? "—"} · {f.cargo_name ?? "—"} ·{" "}
                  {f.rate != null ? `${fmt(Number(f.rate))} ₽` : "—"}
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Общий вес: <strong>{fmt(totals.weight)} кг</strong></div>
            <div>Общий объём: <strong>{fmt(totals.volume)} м³</strong></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Условия оплаты</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentType === "delayed" ? (
              <div>
                <Label className="text-xs">Отсрочка (дн.)</Label>
                <Input
                  type="number"
                  min={0}
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label className="text-xs">Комиссия сервиса, %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={commissionPct}
                onChange={(e) => setCommissionPct(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Комментарий диспетчера</Label>
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Доп. условия, контакты на загрузке и т.п."
            />
          </div>

          <div className="rounded border border-primary/30 bg-primary/5 p-2 text-sm">
            <div className="flex justify-between">
              <span>Суммарная ставка</span>
              <strong>{fmt(totals.rate)} ₽</strong>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Комиссия сервиса ({commissionPct}%)</span>
              <span>−{fmt(totals.commission)} ₽</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1">
              <span>К выплате перевозчику</span>
              <strong className="text-primary">{fmt(totals.payout)} ₽</strong>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || freights.length === 0 || totals.rate <= 0}
          >
            Отправить предложение
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { apiPatch } from "@/lib/api-client";
import { LOAD_STATUSES, LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/dispatcher/statuses";

// Блок "Сообщить готовность" для кабинета перевозчика.
// Доступен только для машин из dispatcher_vehicle_ext (source === 'dispatcher').

export interface VehicleReadinessInitial {
  current_city: string | null;
  ready_to_cities: string[] | null;
  ready_date: string | null;
  ready_comment: string | null;
  load_status: string | null;
  free_payload_kg: number | null;
  free_volume_m3: number | null;
  partial_route_from: string | null;
  partial_route_to: string | null;
  loading_restrictions: string | null;
}

export function ReportReadinessBlock({
  vehicleId,
  initial,
}: {
  vehicleId: string;
  initial?: Partial<VehicleReadinessInitial>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(
    (initial?.load_status as LoadStatus) || "empty",
  );
  const [city, setCity] = useState(initial?.current_city ?? "");
  const [readyDate, setReadyDate] = useState(initial?.ready_date ?? "");
  const [readyTo, setReadyTo] = useState(
    (initial?.ready_to_cities ?? []).join(", "),
  );
  const [freeWeight, setFreeWeight] = useState(
    initial?.free_payload_kg != null ? String(initial.free_payload_kg) : "",
  );
  const [freeVolume, setFreeVolume] = useState(
    initial?.free_volume_m3 != null ? String(initial.free_volume_m3) : "",
  );
  const [routeFrom, setRouteFrom] = useState(initial?.partial_route_from ?? "");
  const [routeTo, setRouteTo] = useState(initial?.partial_route_to ?? "");
  const [restrictions, setRestrictions] = useState(initial?.loading_restrictions ?? "");
  const [comment, setComment] = useState(initial?.ready_comment ?? "");

  const mut = useMutation({
    mutationFn: () =>
      apiPatch<{ ok: true; row: unknown }>(
        `/api/carrier/vehicles/${vehicleId}/readiness`,
        {
          load_status: loadStatus,
          current_city: city || null,
          ready_date: readyDate || null,
          ready_to_cities: readyTo
            ? readyTo.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          free_payload_kg: freeWeight ? Number(freeWeight) : null,
          free_volume_m3: freeVolume ? Number(freeVolume) : null,
          partial_route_from: routeFrom || null,
          partial_route_to: routeTo || null,
          loading_restrictions: restrictions || null,
          ready_comment: comment || null,
        },
      ),
    onSuccess: () => {
      toast.success("Готовность обновлена");
      qc.invalidateQueries({ queryKey: ["carrier", "vehicles"] });
      setOpen(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    },
  });

  if (!open) {
    return (
      <div className="space-y-2 rounded border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs">
            <div className="font-medium">Готовность машины</div>
            <div className="text-muted-foreground">
              {initial?.load_status
                ? LOAD_STATUS_LABELS[initial.load_status as LoadStatus] ?? initial.load_status
                : "Не указано"}
              {initial?.current_city ? ` · ${initial.current_city}` : ""}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Сообщить готовность
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-border bg-card p-3 text-sm">
      <div className="text-sm font-medium">Сообщить готовность машины</div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Состояние</Label>
          <Select value={loadStatus} onValueChange={(v) => setLoadStatus(v as LoadStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {LOAD_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Текущий город</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Москва" />
        </div>
        <div>
          <Label className="text-xs">Дата готовности</Label>
          <Input type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Готов в города (через запятую)</Label>
          <Input value={readyTo} onChange={(e) => setReadyTo(e.target.value)} placeholder="СПб, Казань" />
        </div>

        {loadStatus === "partial" ? (
          <>
            <div>
              <Label className="text-xs">Свободный вес, кг</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={freeWeight}
                onChange={(e) => setFreeWeight(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Свободный объём, м³</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={freeVolume}
                onChange={(e) => setFreeVolume(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Догруз: откуда</Label>
              <Input value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Догруз: куда</Label>
              <Input value={routeTo} onChange={(e) => setRouteTo(e.target.value)} />
            </div>
          </>
        ) : null}

        <div className="sm:col-span-2">
          <Label className="text-xs">Ограничения по загрузке</Label>
          <Input
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            placeholder="например: только сверху, до 5 паллет"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Комментарий</Label>
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={mut.isPending}>
          Отмена
        </Button>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Обновить готовность
        </Button>
      </div>
    </div>
  );
}

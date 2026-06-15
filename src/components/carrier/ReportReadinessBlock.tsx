import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CityCombobox, CityMultiCombobox } from "@/components/common/CityCombobox";
import { apiPatch } from "@/lib/api-client";
import {
  LOAD_STATUSES,
  LOAD_STATUS_LABELS,
  VEHICLE_READY_MODES,
  VEHICLE_READY_MODE_LABELS,
  WEEKDAY_LABELS_SHORT,
  type LoadStatus,
  type VehicleReadyMode,
} from "@/lib/dispatcher/statuses";
import { RUSSIA_ZONES, splitZonesAndCities } from "@/lib/dispatcher/zones";

/**
 * Самостоятельное обновление готовности машины.
 * Используется в кабинете перевозчика и кабинета водителя.
 * Endpoint передаётся пропом — у перевозчика per-vehicle, у водителя one-shot.
 */

export interface VehicleReadinessInitial {
  current_city: string | null;
  ready_to_cities: string[] | null;
  ready_date: string | null;
  ready_from: string | null;
  ready_comment: string | null;
  ready_radius_km: number | null;
  ready_mode: string | null;
  ready_weekdays: number[] | null;
  load_status: string | null;
  free_payload_kg: number | null;
  free_volume_m3: number | null;
  partial_route_from: string | null;
  partial_route_to: string | null;
  loading_restrictions: string | null;
  location_updated_at?: string | null;
}

interface Props {
  /** PATCH endpoint, например /api/carrier/vehicles/abc/readiness или /api/driver/my-vehicle */
  endpoint: string;
  /** Ключ кэша react-query, который инвалидируется после сохранения. */
  invalidateKey: readonly unknown[];
  initial?: Partial<VehicleReadinessInitial>;
  /** Заголовок блока. */
  title?: string;
  /** По умолчанию блок свёрнут; передайте true чтобы открыть сразу. */
  defaultOpen?: boolean;
}

const WEEKDAYS: ReadonlyArray<{ value: number; label: string }> = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => ({ value: n, label: WEEKDAY_LABELS_SHORT[n] ?? String(n) }),
);

export function ReportReadinessBlock({
  endpoint,
  invalidateKey,
  initial,
  title = "Местоположение и готовность машины",
  defaultOpen,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(Boolean(defaultOpen));

  const split = splitZonesAndCities(initial?.ready_to_cities ?? []);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(
    (initial?.load_status as LoadStatus) || "empty",
  );
  const [currentCity, setCurrentCity] = useState(initial?.current_city ?? "");
  const [readyDate, setReadyDate] = useState(initial?.ready_date ?? "");
  const [readyFrom, setReadyFrom] = useState(initial?.ready_from ?? "");
  const [readyCities, setReadyCities] = useState<string[]>(split.cities);
  const [readyZones, setReadyZones] = useState<string[]>(split.zones);
  const [readyRadius, setReadyRadius] = useState<string>(
    initial?.ready_radius_km != null ? String(initial.ready_radius_km) : "",
  );
  const [readyMode, setReadyMode] = useState<VehicleReadyMode | "">(
    (initial?.ready_mode as VehicleReadyMode) || "",
  );
  const [readyWeekdays, setReadyWeekdays] = useState<number[]>(initial?.ready_weekdays ?? []);
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

  const toggleZone = (id: string) => {
    setReadyZones((prev) =>
      prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id],
    );
  };
  const toggleWeekday = (n: number) => {
    setReadyWeekdays((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n].sort((a, b) => a - b),
    );
  };

  const mut = useMutation({
    mutationFn: () =>
      apiPatch<{ ok: true; row: unknown }>(endpoint, {
        load_status: loadStatus,
        current_city: currentCity.trim() || null,
        ready_date: readyDate || null,
        ready_from: readyFrom || null,
        ready_to_cities: [...readyZones, ...readyCities],
        ready_radius_km: readyRadius === "" ? null : Number(readyRadius),
        ready_mode: readyMode || null,
        ready_weekdays: readyWeekdays.length ? readyWeekdays : null,
        free_payload_kg: freeWeight ? Number(freeWeight) : null,
        free_volume_m3: freeVolume ? Number(freeVolume) : null,
        partial_route_from: routeFrom || null,
        partial_route_to: routeTo || null,
        loading_restrictions: restrictions || null,
        ready_comment: comment || null,
      }),
    onSuccess: () => {
      toast.success("Готовность обновлена");
      qc.invalidateQueries({ queryKey: invalidateKey });
      // карта и дашборд AI-диспетчера должны увидеть новое местоположение сразу
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-vehicles"] });
      setOpen(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    },
  });

  // ---- свёрнутое состояние: краткая сводка ----
  if (!open) {
    const summaryCity = initial?.current_city || "город не указан";
    const summaryReady = [
      ...(splitZonesAndCities(initial?.ready_to_cities ?? []).zones),
      ...(splitZonesAndCities(initial?.ready_to_cities ?? []).cities).slice(0, 2),
    ];
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {title}
            </div>
            <div className="text-muted-foreground">
              Сейчас: <span className="text-foreground">{summaryCity}</span>
              {initial?.load_status ? (
                <>
                  {" · "}
                  {LOAD_STATUS_LABELS[initial.load_status as LoadStatus] ?? initial.load_status}
                </>
              ) : null}
            </div>
            {summaryReady.length > 0 && (
              <div className="text-muted-foreground">
                Готов ехать: <span className="text-foreground">{summaryReady.join(", ")}</span>
                {initial?.ready_radius_km ? ` · радиус ${initial.ready_radius_km} км` : ""}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Обновить
          </Button>
        </div>
      </div>
    );
  }

  // ---- развёрнутая форма ----
  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-3 text-sm">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <MapPin className="h-4 w-4" />
          {title}
        </div>
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Эти данные видит диспетчер на карте. Чем точнее вы укажете город,
          готовность и направления, тем быстрее мы подберём подходящий груз.
        </p>
      </div>

      {/* Состояние и текущий город */}
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
          <CityCombobox value={currentCity} onChange={setCurrentCity} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            После сохранения карта обновится автоматически.
          </p>
        </div>
      </div>

      {/* Куда готов ехать */}
      <div className="space-y-2">
        <Label className="text-xs">Куда готов ехать — крупные направления</Label>
        <div className="flex flex-wrap gap-1.5">
          {RUSSIA_ZONES.map((z) => {
            const on = readyZones.includes(z.id);
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => toggleZone(z.id)}
                title={z.hint}
                className={
                  "rounded-full border px-2.5 py-1 text-xs transition " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
              >
                {z.label}
              </button>
            );
          })}
        </div>
        <div>
          <Label className="text-xs">…и/или конкретные города</Label>
          <CityMultiCombobox value={readyCities} onChange={setReadyCities} />
        </div>
      </div>

      {/* Радиус и режим готовности */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Радиус от текущего города, км (0–999)</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={readyRadius}
            onChange={(e) => setReadyRadius(e.target.value)}
            placeholder="например: 200"
          />
        </div>
        <div>
          <Label className="text-xs">Режим готовности</Label>
          <Select
            value={readyMode || "__none__"}
            onValueChange={(v) => setReadyMode(v === "__none__" ? "" : (v as VehicleReadyMode))}
          >
            <SelectTrigger>
              <SelectValue placeholder="не задано" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Не задано</SelectItem>
              {VEHICLE_READY_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {VEHICLE_READY_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Дни недели — только для weekdays/custom */}
      {(readyMode === "weekdays" || readyMode === "custom") && (
        <div>
          <Label className="text-xs">Дни недели</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = readyWeekdays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  className={
                    "h-8 w-10 rounded-md border text-xs transition " +
                    (on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted")
                  }
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Даты */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {readyMode === "from_date" && (
          <div>
            <Label className="text-xs">Готов с</Label>
            <Input
              type="date"
              value={readyFrom}
              onChange={(e) => setReadyFrom(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label className="text-xs">Дата готовности (разовая)</Label>
          <Input
            type="date"
            value={readyDate}
            onChange={(e) => setReadyDate(e.target.value)}
          />
        </div>
      </div>

      {/* Догруз — только если partial */}
      {loadStatus === "partial" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
      )}

      <div>
        <Label className="text-xs">Ограничения по загрузке</Label>
        <Input
          value={restrictions}
          onChange={(e) => setRestrictions(e.target.value)}
          placeholder="например: только сверху, до 5 паллет"
        />
      </div>

      <div>
        <Label className="text-xs">Комментарий готовности</Label>
        <Textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="например: после 14:00, нужен пропуск"
        />
      </div>

      {/* selected chips preview */}
      {(readyZones.length > 0 || readyCities.length > 0) && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-2">
          <div className="text-[11px] text-muted-foreground">Куда готов ехать (предпросмотр):</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {readyZones.map((z) => (
              <Badge key={`z-${z}`} variant="secondary" className="gap-1">
                {z}
                <button type="button" onClick={() => toggleZone(z)} aria-label="убрать">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {readyCities.map((c) => (
              <Badge key={`c-${c}`} variant="outline" className="gap-1">
                {c}
                <button
                  type="button"
                  onClick={() => setReadyCities((prev) => prev.filter((x) => x !== c))}
                  aria-label="убрать"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={mut.isPending}>
          Отмена
        </Button>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Сохранить готовность
        </Button>
      </div>
    </div>
  );
}

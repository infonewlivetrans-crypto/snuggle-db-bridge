import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CityCombobox, CityMultiCombobox } from "@/components/common/CityCombobox";
import { apiPatch } from "@/lib/api-client";
import {
  BIG_DIRECTIONS,
  POPULAR_CITIES,
  RADIUS_PRESETS,
  SIMPLE_READY_MODE_LABELS,
  SIMPLE_READY_MODES,
  deriveSimpleMode,
  simpleModeToPatch,
  summarizeReadiness,
  type SimpleReadyMode,
} from "@/lib/dispatcher/readiness-summary";
import { computeVehicleReadiness } from "@/lib/dispatcher/vehicle-readiness";
import { splitZonesAndCities } from "@/lib/dispatcher/zones";

/**
 * Единый упрощённый редактор «Местонахождение и направления машины».
 * Использует существующие поля БД (current_city, ready_mode, ready_from,
 * ready_radius_km, ready_to_cities, load_status) — без новых миграций.
 */

export interface VehicleReadinessInitial {
  current_city?: string | null;
  ready_to_cities?: string[] | null;
  ready_radius_km?: number | null;
  ready_mode?: string | null;
  ready_from?: string | null;
  ready_date?: string | null;
  load_status?: string | null;
  driver_id?: string | null;
  dispatcher_driver_ext_id?: string | null;
  is_active?: boolean | null;
  dispatcher_status?: string | null;
  body_type?: string | null;
  payload_kg?: number | null;
  capacity_kg?: number | null;
  home_city?: string | null;
}

interface Props {
  endpoint: string;
  invalidateKey: readonly unknown[];
  initial?: VehicleReadinessInitial;
  title?: string;
}

export function VehicleReadinessEditor({
  endpoint,
  invalidateKey,
  initial,
  title = "Местонахождение и направления машины",
}: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const split = useMemo(
    () => splitZonesAndCities(initial?.ready_to_cities ?? []),
    [initial?.ready_to_cities],
  );

  const [currentCity, setCurrentCity] = useState(initial?.current_city ?? "");
  const [mode, setMode] = useState<SimpleReadyMode>(deriveSimpleMode(initial ?? {}));
  const [fromDate, setFromDate] = useState(initial?.ready_from ?? "");
  const [radius, setRadius] = useState<string>(
    initial?.ready_radius_km != null ? String(initial.ready_radius_km) : "any",
  );
  const [directions, setDirections] = useState<string[]>(split.zones);
  const [cities, setCities] = useState<string[]>(split.cities);

  const toggleDirection = (id: string) =>
    setDirections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const mut = useMutation({
    mutationFn: async () => {
      const modePatch = simpleModeToPatch(mode, fromDate || null);
      const payload = {
        current_city: currentCity.trim() || null,
        ready_to_cities: [...directions, ...cities],
        ready_radius_km: radius === "any" ? null : Number(radius),
        ...modePatch,
      };
      return apiPatch<{ ok?: true; row?: unknown }>(endpoint, payload);
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-vehicles"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
      setEditing(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  const summary = summarizeReadiness({
    ...initial,
    current_city: currentCity || initial?.current_city,
    ready_to_cities: [...directions, ...cities],
    ready_radius_km: radius === "any" ? null : Number(radius),
    ready_mode: simpleModeToPatch(mode, fromDate || null).ready_mode,
    ready_from: simpleModeToPatch(mode, fromDate || null).ready_from,
    load_status: simpleModeToPatch(mode, fromDate || null).load_status,
  });

  const reasons = computeVehicleReadiness({
    body_type: initial?.body_type,
    payload_kg: initial?.payload_kg,
    capacity_kg: initial?.capacity_kg,
    home_city: initial?.home_city,
    current_city: currentCity || initial?.current_city,
    driver_id: initial?.driver_id,
    dispatcher_driver_ext_id: initial?.dispatcher_driver_ext_id,
    is_active: initial?.is_active,
    dispatcher_status: initial?.dispatcher_status,
    load_status: simpleModeToPatch(mode, fromDate || null).load_status,
  });

  if (!editing) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="h-3.5 w-3.5" /> {title}
            </div>
            <div className="text-xs text-muted-foreground">{summary}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Изменить
          </Button>
        </div>
        {reasons.ready ? (
          <div className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Готова к отображению на карте
          </div>
        ) : (
          <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            <div className="mb-0.5 flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> Ещё не на карте диспетчера
            </div>
            <ul className="ml-4 list-disc space-y-0.5">
              {reasons.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <MapPin className="h-4 w-4" /> {title}
      </div>

      {/* Текущий город */}
      <div>
        <Label className="text-xs">Текущий город машины</Label>
        <CityCombobox value={currentCity} onChange={setCurrentCity} />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {POPULAR_CITIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrentCity(c)}
              className={
                "rounded-full border px-2 py-0.5 text-[11px] transition " +
                (currentCity === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Режим готовности */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Режим готовности</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as SimpleReadyMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIMPLE_READY_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {SIMPLE_READY_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === "from_date" && (
            <Input
              type="date"
              className="mt-2"
              value={fromDate || ""}
              onChange={(e) => setFromDate(e.target.value)}
            />
          )}
        </div>
        <div>
          <Label className="text-xs">Радиус от текущего города</Label>
          <Select value={radius} onValueChange={setRadius}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_PRESETS.map((r) => (
                <SelectItem key={r.label} value={r.value == null ? "any" : String(r.value)}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Куда готов ехать */}
      <div className="space-y-2">
        <Label className="text-xs">Куда готов ехать</Label>
        <div className="flex flex-wrap gap-1.5">
          {BIG_DIRECTIONS.map((d) => {
            const on = directions.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDirection(d)}
                className={
                  "rounded-full border px-2.5 py-1 text-xs transition " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted")
                }
              >
                {d}
              </button>
            );
          })}
        </div>
        <div>
          <Label className="text-xs">Добавить конкретный город</Label>
          <CityMultiCombobox value={cities} onChange={setCities} />
          {cities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {cities.map((c) => (
                <Badge key={c} variant="outline" className="gap-1">
                  {c}
                  <button
                    type="button"
                    onClick={() => setCities((p) => p.filter((x) => x !== c))}
                    aria-label="убрать"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Итог */}
      <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
        {summary}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={mut.isPending}
        >
          Отмена
        </Button>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

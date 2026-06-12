import { useState, useEffect, useMemo } from "react";
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
import {
  LOAD_METHODS,
  LOAD_METHOD_LABELS,
  RUSSIAN_CITIES_PRESET,
  VEHICLE_FEATURES,
  VEHICLE_FEATURE_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  DRIVER_STATUS_LABELS,
  VEHICLE_READY_MODES,
  VEHICLE_READY_MODE_LABELS,
  VEHICLE_LOCATION_SOURCE_LABELS,
  WEEKDAY_LABELS_SHORT,
  type VehicleReadyMode,
  type VehicleStatus,
} from "@/lib/dispatcher/statuses";
import { VehicleBodyTypeSelect } from "@/components/dispatcher/VehicleBodyTypeSelect";
import type { CarrierDTO, DriverDTO, VehicleDTO } from "@/lib/dispatcher/types";
import type { VehicleCreateInput } from "@/lib/dispatcher/schemas";

interface Props {
  initial?: VehicleDTO | null;
  carriers: CarrierDTO[];
  drivers: DriverDTO[];
  /** Если задан — перевозчик подставляется автоматически. */
  initialCarrierId?: string | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (data: VehicleCreateInput) => void;
}

const empty = (v: string | null | undefined): string => (v == null ? "" : v);
const numStr = (n: number | null | undefined): string => (n == null ? "" : String(n));
const toNum = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const LOAD_METHOD_SET = new Set<string>(LOAD_METHODS);
const FEATURE_SET = new Set<string>(VEHICLE_FEATURES);

export function VehicleForm({
  initial,
  carriers,
  drivers,
  initialCarrierId,
  submitting,
  onCancel,
  onSubmit,
}: Props) {

  const [kind, setKind] = useState("");
  const [bodyType, setBodyType] = useState<string>("");
  const [payload, setPayload] = useState("");
  const [volume, setVolume] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [widthM, setWidthM] = useState("");
  const [heightM, setHeightM] = useState("");
  const [loadMethods, setLoadMethods] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [homeCity, setHomeCity] = useState("");
  const [readyTo, setReadyTo] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [readyRadius, setReadyRadius] = useState<string>("");
  const [readyMode, setReadyMode] = useState<VehicleReadyMode>("from_date");
  const [readyFrom, setReadyFrom] = useState<string>("");
  const [readyWeekdays, setReadyWeekdays] = useState<number[]>([]);
  const [locationSource, setLocationSource] = useState<string | null>(null);
  const [currentLat, setCurrentLat] = useState<string>("");
  const [currentLng, setCurrentLng] = useState<string>("");
  const [locationUpdatedAt, setLocationUpdatedAt] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string>("none");
  const [carrierId, setCarrierId] = useState<string>(initialCarrierId ?? "none");
  const [status, setStatus] = useState<VehicleStatus>("new");
  const [minTrip, setMinTrip] = useState("");
  const [minKm, setMinKm] = useState("");
  const [cityRate, setCityRate] = useState("");
  const [pointRate, setPointRate] = useState("");
  const [rateComment, setRateComment] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      // Разделяем load_methods и features: всё, что не "способ загрузки",
      // считаем дополнительным признаком.
      const allMethods = (initial.load_methods ?? []) as string[];
      setLoadMethods(allMethods.filter((m) => LOAD_METHOD_SET.has(m)));
      setFeatures(allMethods.filter((m) => FEATURE_SET.has(m)));
      // Plate сохраняется в vehicle_kind как первая часть, либо отдельный комментарий.
      setKind(empty(initial.vehicle_kind));

      setBodyType(empty(initial.body_type));
      setPayload(numStr(initial.payload_kg));
      setVolume(numStr(initial.volume_m3));
      setLengthM(numStr(initial.length_m));
      setWidthM(numStr(initial.width_m));
      setHeightM(numStr(initial.height_m));
      setHomeCity(empty(initial.home_city));
      setReadyTo((initial.ready_to_cities ?? []).join(", "));
      setReadyDate(initial.ready_date ? String(initial.ready_date).slice(0, 10) : "");
      const init = initial as unknown as Record<string, unknown>;
      setReadyRadius(numStr((init.ready_radius_km ?? null) as number | null));
      setReadyMode(((init.ready_mode as VehicleReadyMode) ?? "from_date"));
      setReadyFrom(init.ready_from ? String(init.ready_from).slice(0, 10) : "");
      setReadyWeekdays(Array.isArray(init.ready_weekdays) ? (init.ready_weekdays as number[]) : []);
      setLocationSource((init.location_source as string | null) ?? null);
      setCurrentLat(init.current_lat == null ? "" : String(init.current_lat));
      setCurrentLng(init.current_lng == null ? "" : String(init.current_lng));
      setLocationUpdatedAt((init.location_updated_at as string | null) ?? null);
      setDriverId(initial.dispatcher_driver_ext_id ?? "none");
      setCarrierId(initial.dispatcher_carrier_ext_id ?? initialCarrierId ?? "none");
      setStatus(
        (VEHICLE_STATUSES as readonly string[]).includes(initial.dispatcher_status ?? "")
          ? (initial.dispatcher_status as VehicleStatus)
          : "new",
      );
      setMinTrip(numStr(initial.minimum_trip_rate));
      setMinKm(numStr(initial.minimum_km_rate));
      setCityRate(numStr(initial.city_rate));
      setPointRate(numStr(initial.point_rate));
      setRateComment(empty(initial.rate_comment));
      setComment(empty(initial.dispatcher_comment));
    } else if (initialCarrierId) {
      setCarrierId(initialCarrierId);
    }
  }, [initial, initialCarrierId]);

  // Когда меняется перевозчик — сбрасываем водителя, если он не из этого перевозчика.
  useEffect(() => {
    if (driverId === "none") return;
    const d = drivers.find((x) => x.id === driverId);
    if (!d) return;
    if (carrierId === "none" || d.dispatcher_carrier_ext_id !== carrierId) {
      setDriverId("none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId]);

  const filteredDrivers = useMemo(() => {
    if (carrierId === "none") return [] as DriverDTO[];
    return drivers.filter((d) => d.dispatcher_carrier_ext_id === carrierId);
  }, [drivers, carrierId]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) => {
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (carrierId === "none") {
      setError("Выберите перевозчика");
      return;
    }
    const safeStatus: VehicleStatus =
      (VEHICLE_STATUSES as readonly string[]).includes(status) ? status : "new";
    onSubmit({
      vehicle_kind: kind || null,
      body_type: bodyType || null,
      payload_kg: toNum(payload),
      volume_m3: toNum(volume),
      length_m: toNum(lengthM),
      width_m: toNum(widthM),
      height_m: toNum(heightM),
      // load_methods хранит и способы загрузки, и доп. признаки (text[]).
      load_methods: [...loadMethods, ...features],
      home_city: homeCity || null,
      ready_to_cities: readyTo
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ready_date: readyDate || null,
      dispatcher_driver_ext_id: driverId === "none" ? null : driverId,
      dispatcher_carrier_ext_id: carrierId,
      dispatcher_status: safeStatus,
      minimum_trip_rate: toNum(minTrip),
      minimum_km_rate: toNum(minKm),
      city_rate: toNum(cityRate),
      point_rate: toNum(pointRate),
      rate_comment: rateComment || null,
      dispatcher_comment: comment || null,
      production_vehicle_id: initial?.production_vehicle_id ?? null,
      ready_radius_km: readyRadius.trim() === "" ? null : Math.max(0, Math.min(999, Math.trunc(Number(readyRadius)) || 0)),
      ready_mode: readyMode ?? null,
      ready_weekdays:
        readyMode === "weekdays" || readyMode === "custom" ? readyWeekdays : null,
      ready_from: readyFrom || null,
      current_lat: currentLat.trim() === "" ? null : (Number(currentLat) || null),
      current_lng: currentLng.trim() === "" ? null : (Number(currentLng) || null),
      location_source:
        currentLat.trim() !== "" && currentLng.trim() !== ""
          ? "admin"
          : ((locationSource as never) ?? null),
    } as never);
  };

  const carrierLabel = (c: CarrierDTO) => {
    const bits = [c.name ?? "—"];
    if (c.phone) bits.push(c.phone);
    if (c.inn) bits.push(`ИНН ${c.inn}`);
    return bits.join(" · ");
  };

  const driverLabel = (d: DriverDTO) => {
    const bits = [d.full_name ?? "—"];
    if (d.phone) bits.push(d.phone);
    if (d.city) bits.push(d.city);
    const st =
      DRIVER_STATUS_LABELS[d.dispatcher_status as keyof typeof DRIVER_STATUS_LABELS] ??
      d.dispatcher_status;
    if (st) bits.push(st);
    return bits.join(" · ");
  };

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>Перевозчик *</Label>
          <Select value={carrierId} onValueChange={setCarrierId}>
            <SelectTrigger><SelectValue placeholder="Выберите перевозчика" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— не выбран —</SelectItem>
              {carrierId !== "none" && !carriers.find((c) => c.id === carrierId) && (
                <SelectItem value={carrierId}>
                  {initial?.dispatcher_carrier_ext_id === carrierId
                    ? "Текущий перевозчик (загрузка…)"
                    : carrierId}
                </SelectItem>
              )}
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{carrierLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Водитель</Label>
          <Select value={driverId} onValueChange={setDriverId} disabled={carrierId === "none"}>
            <SelectTrigger>
              <SelectValue placeholder={carrierId === "none" ? "Сначала выберите перевозчика" : "— без водителя —"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— без водителя —</SelectItem>
              {driverId !== "none" && !filteredDrivers.find((d) => d.id === driverId) && (
                <SelectItem value={driverId}>
                  {initial?.dispatcher_driver_ext_id === driverId
                    ? "Текущий водитель (загрузка…)"
                    : driverId}
                </SelectItem>
              )}
              {filteredDrivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{driverLabel(d)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {carrierId !== "none" && filteredDrivers.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              У перевозчика пока нет водителей. Транспорт можно сохранить «без водителя».
            </p>
          )}
        </div>

        <div>
          <Label>Госномер / Тип ТС</Label>
          <Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="А123ВС777 · Тягач, Газель..." />
        </div>
        <div>
          <Label>Тип кузова</Label>
          <VehicleBodyTypeSelect value={bodyType} onChange={setBodyType} />
        </div>
        <div><Label>Грузоподъёмность, кг</Label><Input value={payload} onChange={(e) => setPayload(e.target.value)} /></div>
        <div><Label>Объём, м³</Label><Input value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
        <div><Label>Длина, м</Label><Input value={lengthM} onChange={(e) => setLengthM(e.target.value)} /></div>
        <div><Label>Ширина, м</Label><Input value={widthM} onChange={(e) => setWidthM(e.target.value)} /></div>
        <div><Label>Высота, м</Label><Input value={heightM} onChange={(e) => setHeightM(e.target.value)} /></div>
        <div>
          <Label>Статус</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as VehicleStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VEHICLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{VEHICLE_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Label>Способы загрузки</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {LOAD_METHODS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => toggle(loadMethods, setLoadMethods, m)}
                className={`px-3 py-1 rounded-md border text-sm ${
                  loadMethods.includes(m)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground hover:bg-accent"
                }`}
              >
                {LOAD_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Дополнительные признаки</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {VEHICLE_FEATURES.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => toggle(features, setFeatures, f)}
                className={`px-3 py-1 rounded-md border text-sm ${
                  features.includes(f)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground hover:bg-accent"
                }`}
              >
                {VEHICLE_FEATURE_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Город нахождения</Label>
          <Input
            list="vehicle-cities-datalist"
            value={homeCity}
            onChange={(e) => setHomeCity(e.target.value)}
            placeholder="Краснодар, Москва, ..."
          />
          <datalist id="vehicle-cities-datalist">
            {RUSSIAN_CITIES_PRESET.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div><Label>Готов ехать (через запятую)</Label><Input value={readyTo} onChange={(e) => setReadyTo(e.target.value)} placeholder="Москва, Казань, ..." /></div>
        <div><Label>Дата готовности</Label><Input type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} /></div>

        <div className="md:col-span-2 mt-2 border-t pt-3">
          <div className="text-sm font-semibold mb-2">Экономика рейса</div>
        </div>
        <div><Label>Мин. ставка за рейс, ₽</Label><Input value={minTrip} onChange={(e) => setMinTrip(e.target.value)} /></div>
        <div><Label>Мин. ставка за км, ₽</Label><Input value={minKm} onChange={(e) => setMinKm(e.target.value)} /></div>
        <div><Label>Ставка по городу, ₽</Label><Input value={cityRate} onChange={(e) => setCityRate(e.target.value)} /></div>
        <div><Label>Ставка за точку, ₽</Label><Input value={pointRate} onChange={(e) => setPointRate(e.target.value)} /></div>
        <div className="md:col-span-2">
          <Label>Комментарий по ставке</Label>
          <Textarea value={rateComment} onChange={(e) => setRateComment(e.target.value)} rows={2} />
        </div>
        <div className="md:col-span-2">
          <Label>Комментарий диспетчера</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Отмена</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Сохранение..." : "Сохранить"}</Button>
      </div>
    </form>
  );
}

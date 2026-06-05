import { useState, useEffect } from "react";
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
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  type LoadMethod,
  type VehicleStatus,
} from "@/lib/dispatcher/statuses";
import type { CarrierDTO, DriverDTO, VehicleDTO } from "@/lib/dispatcher/types";
import type { VehicleCreateInput } from "@/lib/dispatcher/schemas";

interface Props {
  initial?: VehicleDTO | null;
  carriers: CarrierDTO[];
  drivers: DriverDTO[];
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

export function VehicleForm({ initial, carriers, drivers, submitting, onCancel, onSubmit }: Props) {
  const [kind, setKind] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [payload, setPayload] = useState("");
  const [volume, setVolume] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [widthM, setWidthM] = useState("");
  const [heightM, setHeightM] = useState("");
  const [loadMethods, setLoadMethods] = useState<LoadMethod[]>([]);
  const [homeCity, setHomeCity] = useState("");
  const [readyTo, setReadyTo] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [driverId, setDriverId] = useState<string>("none");
  const [carrierId, setCarrierId] = useState<string>("none");
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
      setKind(empty(initial.vehicle_kind));
      setBodyType(empty(initial.body_type));
      setPayload(numStr(initial.payload_kg));
      setVolume(numStr(initial.volume_m3));
      setLengthM(numStr(initial.length_m));
      setWidthM(numStr(initial.width_m));
      setHeightM(numStr(initial.height_m));
      setLoadMethods((initial.load_methods as LoadMethod[]) ?? []);
      setHomeCity(empty(initial.home_city));
      setReadyTo((initial.ready_to_cities ?? []).join(", "));
      setReadyDate(initial.ready_date ? String(initial.ready_date).slice(0, 10) : "");
      setDriverId(initial.dispatcher_driver_ext_id ?? "none");
      setCarrierId(initial.dispatcher_carrier_ext_id ?? "none");
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
    }
  }, [initial]);

  const toggleLoadMethod = (m: LoadMethod) => {
    setLoadMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    onSubmit({
      vehicle_kind: kind || null,
      body_type: bodyType || null,
      payload_kg: toNum(payload),
      volume_m3: toNum(volume),
      length_m: toNum(lengthM),
      width_m: toNum(widthM),
      height_m: toNum(heightM),
      load_methods: loadMethods,
      home_city: homeCity || null,
      ready_to_cities: readyTo
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ready_date: readyDate || null,
      dispatcher_driver_ext_id: driverId === "none" ? null : driverId,
      dispatcher_carrier_ext_id: carrierId === "none" ? null : carrierId,
      dispatcher_status: status,
      minimum_trip_rate: toNum(minTrip),
      minimum_km_rate: toNum(minKm),
      city_rate: toNum(cityRate),
      point_rate: toNum(pointRate),
      rate_comment: rateComment || null,
      dispatcher_comment: comment || null,
      production_vehicle_id: initial?.production_vehicle_id ?? null,
    });
  };

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>Тип ТС</Label><Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Тягач, Газель..." /></div>
        <div><Label>Тип кузова</Label><Input value={bodyType} onChange={(e) => setBodyType(e.target.value)} placeholder="Тент, реф, борт..." /></div>
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
                onClick={() => toggleLoadMethod(m)}
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
        <div><Label>Город нахождения</Label><Input value={homeCity} onChange={(e) => setHomeCity(e.target.value)} /></div>
        <div><Label>Готов ехать (через запятую)</Label><Input value={readyTo} onChange={(e) => setReadyTo(e.target.value)} placeholder="Москва, Казань, ..." /></div>
        <div><Label>Дата готовности</Label><Input type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} /></div>
        <div>
          <Label>Перевозчик</Label>
          <Select value={carrierId} onValueChange={setCarrierId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— не привязан —</SelectItem>
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name ?? c.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Водитель</Label>
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— не привязан —</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

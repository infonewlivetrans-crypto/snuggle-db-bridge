import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Truck, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api-client";
import {
  carriersApi, driversApi, freightsApi, vehiclesApi,
} from "@/lib/dispatcher/api";
import {
  CARRIER_STATUS_LABELS, DRIVER_STATUS_LABELS,
  VEHICLE_STATUS_LABELS, type CarrierStatus, type DriverStatus, type VehicleStatus,
} from "@/lib/dispatcher/statuses";
import type {
  CarrierDTO, DriverDTO, FreightDTO, VehicleDTO,
} from "@/lib/dispatcher/types";

interface Props {
  freight: FreightDTO;
  onChanged: (updated: FreightDTO) => void;
}

const AVAILABLE_VEHICLE_STATUSES = new Set<string>([
  "available", "ready_to_work", "partially_available", "waiting_freight",
]);
const UNAVAILABLE_VEHICLE_STATUSES = new Set<string>([
  "blocked", "archive", "repair", "busy", "on_trip", "unloading", "inactive",
]);

type FitVerdict = "fit" | "partial" | "check" | "unknown";

function evaluateVehicleFit(freight: FreightDTO, v: VehicleDTO): { verdict: FitVerdict; reasons: string[] } {
  const reasons: string[] = [];
  let known = 0;
  let fits = 0;
  let partial = false;

  if (freight.weight_kg != null && v.payload_kg != null) {
    known++;
    if (Number(v.payload_kg) >= Number(freight.weight_kg)) { fits++; reasons.push("вес ок"); }
    else { partial = true; reasons.push("мало г/п"); }
  }
  if (freight.volume_m3 != null && v.volume_m3 != null) {
    known++;
    if (Number(v.volume_m3) >= Number(freight.volume_m3)) { fits++; reasons.push("объём ок"); }
    else { partial = true; reasons.push("мало объёма"); }
  }
  if (freight.body_type && v.body_type) {
    known++;
    if (freight.body_type === v.body_type) { fits++; reasons.push("кузов ок"); }
    else { partial = true; reasons.push("др. кузов"); }
  }
  if (freight.loading_city && (v.home_city || (v.ready_to_cities && v.ready_to_cities.length))) {
    known++;
    const lc = freight.loading_city.toLowerCase().trim();
    const home = (v.home_city ?? "").toLowerCase().trim();
    const ready = (v.ready_to_cities ?? []).map((c) => c.toLowerCase().trim());
    if (home === lc || ready.includes(lc)) { fits++; reasons.push("город ок"); }
    else { partial = true; reasons.push("др. город"); }
  }

  if (known === 0) return { verdict: "unknown", reasons: ["недостаточно данных"] };
  if (fits === known) return { verdict: "fit", reasons };
  if (partial && fits > 0) return { verdict: "partial", reasons };
  return { verdict: "check", reasons };
}

function vehicleAvailability(v: VehicleDTO): "free" | "busy" | "unknown" {
  if (AVAILABLE_VEHICLE_STATUSES.has(v.dispatcher_status)) return "free";
  if (UNAVAILABLE_VEHICLE_STATUSES.has(v.dispatcher_status)) return "busy";
  return "unknown";
}

export function FreightAssignmentBlock({ freight, onChanged }: Props) {
  const [carriers, setCarriers] = useState<CarrierDTO[]>([]);
  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);

  const [carrierId, setCarrierId] = useState<string | null>(freight.assigned_carrier_ext_id ?? null);
  const [driverId, setDriverId] = useState<string | null>(freight.assigned_driver_ext_id ?? null);
  const [vehicleId, setVehicleId] = useState<string | null>(freight.assigned_vehicle_ext_id ?? null);

  const [carrierOpen, setCarrierOpen] = useState(false);
  const [driverOpen, setDriverOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(5);
  const [requestComment, setRequestComment] = useState("");

  // Load carriers once.
  useEffect(() => {
    carriersApi.list({ limit: 500 })
      .then((r) => setCarriers(r.rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Не удалось загрузить перевозчиков"));
  }, []);

  // Drivers + vehicles for selected carrier.
  useEffect(() => {
    if (!carrierId) { setDrivers([]); setVehicles([]); return; }
    driversApi.list({ carrier_id: carrierId, limit: 500 })
      .then((r) => setDrivers(r.rows))
      .catch(() => setDrivers([]));
    vehiclesApi.list({ carrier_id: carrierId, limit: 500 })
      .then((r) => setVehicles(r.rows))
      .catch(() => setVehicles([]));
  }, [carrierId]);

  const carrier = useMemo(() => carriers.find((c) => c.id === carrierId) ?? null, [carriers, carrierId]);
  const driver = useMemo(() => drivers.find((d) => d.id === driverId) ?? null, [drivers, driverId]);
  const vehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId) ?? null, [vehicles, vehicleId]);

  // When carrier changes, drop driver/vehicle if they don't belong.
  useEffect(() => {
    if (driverId && drivers.length && !drivers.some((d) => d.id === driverId)) setDriverId(null);
  }, [drivers, driverId]);
  useEffect(() => {
    if (vehicleId && vehicles.length && !vehicles.some((v) => v.id === vehicleId)) setVehicleId(null);
  }, [vehicles, vehicleId]);

  // Sort vehicles: driver's vehicles first if a driver is chosen, then free, then unknown, then busy.
  const sortedVehicles = useMemo(() => {
    const arr = [...vehicles];
    arr.sort((a, b) => {
      const ad = driverId && a.dispatcher_driver_ext_id === driverId ? 0 : 1;
      const bd = driverId && b.dispatcher_driver_ext_id === driverId ? 0 : 1;
      if (ad !== bd) return ad - bd;
      const av = vehicleAvailability(a);
      const bv = vehicleAvailability(b);
      const order = { free: 0, unknown: 1, busy: 2 } as const;
      return order[av] - order[bv];
    });
    return arr;
  }, [vehicles, driverId]);

  const handleSaveAssignment = async () => {
    if (driverId && carrierId) {
      const d = drivers.find((x) => x.id === driverId);
      if (d && d.dispatcher_carrier_ext_id && d.dispatcher_carrier_ext_id !== carrierId) {
        toast.error("Водитель не относится к выбранному перевозчику");
        return;
      }
    }
    if (vehicleId && carrierId) {
      const v = vehicles.find((x) => x.id === vehicleId);
      if (v && v.dispatcher_carrier_ext_id && v.dispatcher_carrier_ext_id !== carrierId) {
        toast.error("Транспорт не относится к выбранному перевозчику");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await freightsApi.update(freight.id, {
        assigned_carrier_ext_id: carrierId ?? null,
        assigned_driver_ext_id: driverId ?? null,
        assigned_vehicle_ext_id: vehicleId ?? null,
      });
      toast.success("Назначение сохранено");
      onChanged(res.row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!carrierId) { toast.error("Выберите перевозчика"); return; }
    setCreating(true);
    try {
      const res = await apiPost<{ row: { id: string; request_number: string } }>(
        `/api/dispatcher/freights/${freight.id}/create-carrier-request`,
        {
          dispatcher_carrier_ext_id: carrierId,
          dispatcher_driver_ext_id: driverId ?? null,
          dispatcher_vehicle_ext_id: vehicleId ?? null,
          commission_percent: commissionPercent,
          dispatcher_comment: requestComment || null,
        },
      );
      toast.success(`Создана заявка ${res.row.request_number}`);
      // Refresh freight to pick up carrier_request_id link.
      try {
        const fresh = await freightsApi.get(freight.id);
        onChanged(fresh.row);
      } catch { /* ignore */ }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать заявку");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3 bg-background">
      <div className="text-sm font-medium">Назначение машины</div>

      {/* Перевозчик */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Перевозчик
        </div>
        <Popover open={carrierOpen} onOpenChange={setCarrierOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
              <span className="truncate text-left">
                {carrier ? `${carrier.name ?? "—"}${carrier.inn ? ` · ИНН ${carrier.inn}` : ""}` : "Выбрать перевозчика…"}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Поиск по названию, телефону, ИНН…" />
              <CommandList>
                <CommandEmpty>Не найдено</CommandEmpty>
                <CommandGroup>
                  {carriers.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name ?? ""} ${c.phone ?? ""} ${c.inn ?? ""} ${c.city ?? ""}`}
                      onSelect={() => {
                        setCarrierId(c.id);
                        setDriverId(null);
                        setVehicleId(null);
                        setCarrierOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", carrierId === c.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{c.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[c.phone, c.inn, c.city, CARRIER_STATUS_LABELS[c.verification_status as CarrierStatus] ?? c.verification_status].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Водитель */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <User className="h-3 w-3" /> Водитель {carrierId ? "" : "(сначала выберите перевозчика)"}
        </div>
        <Popover open={driverOpen} onOpenChange={setDriverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" disabled={!carrierId} className="w-full justify-between font-normal">
              <span className="truncate text-left">
                {driver ? `${driver.full_name ?? "—"}${driver.phone ? ` · ${driver.phone}` : ""}` : "Выбрать водителя…"}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Поиск по ФИО, телефону…" />
              <CommandList>
                <CommandEmpty>Нет водителей у перевозчика</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__none__" onSelect={() => { setDriverId(null); setDriverOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", !driverId ? "opacity-100" : "opacity-0")} />
                    <span className="text-muted-foreground">Без водителя</span>
                  </CommandItem>
                  {drivers.map((d) => (
                    <CommandItem
                      key={d.id}
                      value={`${d.full_name ?? ""} ${d.phone ?? ""} ${d.city ?? ""}`}
                      onSelect={() => { setDriverId(d.id); setDriverOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", driverId === d.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{d.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[d.phone, d.city, DRIVER_STATUS_LABELS[d.dispatcher_status as DriverStatus] ?? d.dispatcher_status].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Транспорт */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Truck className="h-3 w-3" /> Транспорт {carrierId ? "" : "(сначала выберите перевозчика)"}
        </div>
        <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" disabled={!carrierId} className="w-full justify-between font-normal">
              <span className="truncate text-left">
                {vehicle
                  ? `${vehicle.body_type ?? vehicle.vehicle_kind ?? "ТС"} · ${vehicle.payload_kg ?? "—"} кг · ${vehicle.volume_m3 ?? "—"} м³`
                  : "Выбрать транспорт…"}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Поиск по кузову, городу…" />
              <CommandList>
                <CommandEmpty>Нет транспорта у перевозчика</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__none__" onSelect={() => { setVehicleId(null); setVehicleOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", !vehicleId ? "opacity-100" : "opacity-0")} />
                    <span className="text-muted-foreground">Без транспорта</span>
                  </CommandItem>
                  {sortedVehicles.map((v) => {
                    const fit = evaluateVehicleFit(freight, v);
                    const avail = vehicleAvailability(v);
                    const drv = drivers.find((d) => d.id === v.dispatcher_driver_ext_id);
                    return (
                      <CommandItem
                        key={v.id}
                        value={`${v.body_type ?? ""} ${v.vehicle_kind ?? ""} ${v.home_city ?? ""} ${(v.ready_to_cities ?? []).join(" ")}`}
                        onSelect={() => { setVehicleId(v.id); setVehicleOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", vehicleId === v.id ? "opacity-100" : "opacity-0")} />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="truncate">
                            {v.body_type ?? v.vehicle_kind ?? "—"} · {v.payload_kg ?? "—"} кг · {v.volume_m3 ?? "—"} м³
                          </div>
                          <div className="text-xs text-muted-foreground truncate flex flex-wrap gap-1 items-center">
                            <span>{v.home_city ?? "—"}</span>
                            <span>·</span>
                            <span>{VEHICLE_STATUS_LABELS[v.dispatcher_status as VehicleStatus] ?? v.dispatcher_status}</span>
                            <span>·</span>
                            <span>{drv ? drv.full_name ?? "—" : "Без водителя"}</span>
                            <Badge variant={avail === "free" ? "default" : avail === "busy" ? "destructive" : "secondary"} className="ml-1 h-4 px-1 text-[10px]">
                              {avail === "free" ? "свободна" : avail === "busy" ? "занята" : "?"}
                            </Badge>
                            <Badge variant={fit.verdict === "fit" ? "default" : fit.verdict === "partial" ? "secondary" : fit.verdict === "check" ? "destructive" : "outline"} className="h-4 px-1 text-[10px]">
                              {fit.verdict === "fit" ? "подходит" : fit.verdict === "partial" ? "частично" : fit.verdict === "check" ? "проверить" : "?"}
                            </Badge>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {vehicle && (() => {
          const fit = evaluateVehicleFit(freight, vehicle);
          return (
            <div className="text-xs text-muted-foreground">
              Соответствие грузу: <span className="font-medium">
                {fit.verdict === "fit" ? "подходит" : fit.verdict === "partial" ? "частично подходит" : fit.verdict === "check" ? "требует проверки" : "недостаточно данных"}
              </span>
              {fit.reasons.length ? ` (${fit.reasons.join(", ")})` : ""}
            </div>
          );
        })()}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" disabled={saving} onClick={handleSaveAssignment}>
          {saving ? "Сохраняем…" : "Сохранить назначение"}
        </Button>
      </div>

      {/* Создать заявку перевозчику */}
      <div className="space-y-2 pt-3 border-t">
        <div className="text-sm font-medium">Заявка перевозчику</div>
        {freight.carrier_request_id ? (
          <div className="text-xs text-muted-foreground">
            Заявка уже создана: <span className="font-mono">{freight.carrier_request_id}</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs text-muted-foreground">Комиссия, %</label>
              <Input
                type="number" min={0} max={100} step={0.1}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(Number(e.target.value) || 0)}
                className="w-24 h-8"
              />
            </div>
            <Textarea
              placeholder="Комментарий для перевозчика (необязательно)"
              value={requestComment}
              onChange={(e) => setRequestComment(e.target.value)}
              className="min-h-[60px]"
            />
            <Button size="sm" disabled={creating || !carrierId} onClick={handleCreateRequest}>
              {creating ? "Создаём…" : "Создать заявку перевозчику"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

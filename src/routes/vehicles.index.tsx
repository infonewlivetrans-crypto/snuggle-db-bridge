import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import { fetchListViaApi } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BODY_TYPE_LABELS,
  BODY_TYPE_ORDER,
  type BodyType,
  type Carrier,
  type Vehicle,
} from "@/lib/carriers";
import { Plus, Search, Truck, Filter } from "lucide-react";

export const Route = createFileRoute("/vehicles/")({
  head: () => ({ meta: [{ title: "Автомобили — Радиус Трек" }] }),
  component: VehiclesPage,
});

function VehiclesPage() {
  const [search, setSearch] = useState("");
  const [bodyFilter, setBodyFilter] = useState<BodyType | "all">("all");
  const [minCapacity, setMinCapacity] = useState("");
  const [minVolume, setMinVolume] = useState("");
  const [minLength, setMinLength] = useState("");
  const [minWidth, setMinWidth] = useState("");
  const [minHeight, setMinHeight] = useState("");
  const [needTent, setNeedTent] = useState(false);
  const [needStraps, setNeedStraps] = useState(false);
  const [needManipulator, setNeedManipulator] = useState(false);
  const [minRings, setMinRings] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [open, setOpen] = useState(false);

  const { data: vehicles, isLoading, refetch } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { rows } = await fetchListViaApi<Vehicle>("/api/vehicles", { limit: 100 });
      return rows;
    },
    staleTime: 5 * 60_000,
  });

  const { data: carriers } = useQuery({
    queryKey: ["carriers", "map"],
    queryFn: async (): Promise<Carrier[]> => {
      const { data, error } = await db.from("carriers").select("id, company_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const carrierMap = useMemo(() => {
    const m = new Map<string, string>();
    (carriers ?? []).forEach((c) => m.set(c.id, c.company_name));
    return m;
  }, [carriers]);

  const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    const q = search.toLowerCase();
    const minCap = num(minCapacity);
    const minVol = num(minVolume);
    const minL = num(minLength);
    const minW = num(minWidth);
    const minH = num(minHeight);
    const minR = minRings.trim() ? Number(minRings) : null;

    return vehicles.filter((v) => {
      if (activeOnly && !v.is_active) return false;
      if (bodyFilter !== "all" && v.body_type !== bodyFilter) return false;
      if (
        q &&
        !v.plate_number.toLowerCase().includes(q) &&
        !(v.brand?.toLowerCase().includes(q) ?? false) &&
        !(v.model?.toLowerCase().includes(q) ?? false)
      )
        return false;
      if (minCap !== null && (v.capacity_kg ?? 0) < minCap) return false;
      if (minVol !== null && (v.volume_m3 ?? 0) < minVol) return false;
      if (minL !== null && (v.body_length_m ?? 0) < minL) return false;
      if (minW !== null && (v.body_width_m ?? 0) < minW) return false;
      if (minH !== null && (v.body_height_m ?? 0) < minH) return false;
      if (minR !== null && v.tie_rings_count < minR) return false;
      if (needTent && !v.has_tent) return false;
      if (needStraps && !v.has_straps) return false;
      if (needManipulator && !v.has_manipulator) return false;
      return true;
    });
  }, [
    vehicles,
    search,
    bodyFilter,
    minCapacity,
    minVolume,
    minLength,
    minWidth,
    minHeight,
    minRings,
    needTent,
    needStraps,
    needManipulator,
    activeOnly,
  ]);

  const resetFilters = () => {
    setBodyFilter("all");
    setMinCapacity("");
    setMinVolume("");
    setMinLength("");
    setMinWidth("");
    setMinHeight("");
    setMinRings("");
    setNeedTent(false);
    setNeedStraps(false);
    setNeedManipulator(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Автомобили</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Подбор машины по параметрам кузова, грузоподъёмности и оборудованию
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Добавить автомобиль
          </Button>
        </div>

        {/* Поиск + фильтр */}
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Госномер, марка, модель..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Список */}
            <div className="rounded-lg border border-border bg-card">
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground">Загрузка...</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">Автомобили не найдены</div>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                    Обновить
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((v) => (
                    <li key={v.id}>
                      <Link
                        to="/vehicles/$vehicleId"
                        params={{ vehicleId: v.id }}
                        className="flex items-start gap-4 p-4 transition-colors hover:bg-secondary/40"
                      >
                        {v.photo_front_url ? (
                          <img src={v.photo_front_url} alt={v.plate_number} className="h-20 w-28 rounded-md object-cover" />
                        ) : (
                          <div className="flex h-20 w-28 items-center justify-center rounded-md bg-secondary">
                            <Truck className="h-7 w-7 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-sm font-bold text-foreground">
                              {v.plate_number}
                            </span>
                            <Badge variant="outline" className="border-border bg-secondary text-xs">
                              {BODY_TYPE_LABELS[v.body_type]}
                            </Badge>
                            {!v.is_active && (
                              <Badge variant="outline" className="border-border bg-muted text-[10px] text-muted-foreground">
                                Неактивен
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 text-sm font-medium text-foreground">
                            {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {carrierMap.get(v.carrier_id) ?? "—"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground">
                            {v.capacity_kg !== null && <span>📦 {v.capacity_kg} кг</span>}
                            {v.volume_m3 !== null && <span>📐 {v.volume_m3} м³</span>}
                            {v.body_length_m !== null && (
                              <span>
                                📏 {v.body_length_m}×{v.body_width_m ?? "?"}×{v.body_height_m ?? "?"} м
                              </span>
                            )}
                            {v.tie_rings_count > 0 && <span>🔗 {v.tie_rings_count} колец</span>}
                            {v.has_straps && <span>🪢 Ремни</span>}
                            {v.has_tent && <span>⛺ Тент</span>}
                            {v.has_manipulator && <span>🏗 Манипулятор</span>}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Фильтры */}
          <aside className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Filter className="h-4 w-4" />
                Подбор автомобиля
              </div>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
                Сбросить
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Тип кузова</Label>
                <Select value={bodyFilter} onValueChange={(v) => setBodyFilter(v as BodyType | "all")}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Любой</SelectItem>
                    {BODY_TYPE_ORDER.map((b) => (
                      <SelectItem key={b} value={b}>
                        {BODY_TYPE_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Грузоп., кг</Label>
                  <Input type="number" inputMode="decimal" value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)} placeholder="мин." className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs">Объём, м³</Label>
                  <Input type="number" inputMode="decimal" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} placeholder="мин." className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs">Длина, м</Label>
                  <Input type="number" inputMode="decimal" value={minLength} onChange={(e) => setMinLength(e.target.value)} placeholder="мин." className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs">Ширина, м</Label>
                  <Input type="number" inputMode="decimal" value={minWidth} onChange={(e) => setMinWidth(e.target.value)} placeholder="мин." className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs">Высота, м</Label>
                  <Input type="number" inputMode="decimal" value={minHeight} onChange={(e) => setMinHeight(e.target.value)} placeholder="мин." className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs">Колец</Label>
                  <Input type="number" min="0" value={minRings} onChange={(e) => setMinRings(e.target.value)} placeholder="мин." className="mt-1.5" />
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-2">
                <FilterToggle label="Ремни / крепления" value={needStraps} onChange={setNeedStraps} />
                <FilterToggle label="Тент" value={needTent} onChange={setNeedTent} />
                <FilterToggle label="Манипулятор" value={needManipulator} onChange={setNeedManipulator} />
                <FilterToggle label="Только активные" value={activeOnly} onChange={setActiveOnly} />
              </div>

              <div className="text-xs text-muted-foreground">
                Найдено: <span className="font-semibold text-foreground">{filtered.length}</span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <VehicleFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function FilterToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

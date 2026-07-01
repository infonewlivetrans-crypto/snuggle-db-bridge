// AI-диспетчер: расширенные панели этапа «Связки грузов, ATI-фильтры,
// несколько автомобилей, очередь звонков».
// dev/mock. API ATI не используется. Radius Track Browser Agent будет
// подключён следующим этапом.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { apiGetAuth, apiPost, apiPatch } from "@/lib/api-client";
import {
  ATI_BODY_TYPE_LABELS, ATI_LOADING_TYPE_LABELS, ATI_PAYMENT_TYPE_LABELS,
  DEFAULT_ATI_FILTERS,
  type AtiFilters, type AtiBodyType, type AtiLoadingType, type AtiPaymentType,
} from "@/lib/ai-dispatcher/ati-filters";
import { Layers, PhoneCall, Truck, X, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";

/* -------------------- ATI Filter Model -------------------- */

export function AtiFilterModelBlock({
  value, onChange,
}: {
  value: AtiFilters;
  onChange: (v: AtiFilters) => void;
}) {
  const v = value;
  const set = <K extends keyof AtiFilters>(k: K, val: AtiFilters[K]) => onChange({ ...v, [k]: val });
  const toggle = <K extends "body_types" | "loading_types" | "payment_types">(
    k: K, item: string,
  ) => {
    const list = (v[k] as string[] | undefined) ?? [];
    const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set(k, next as any);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Фильтры ATI (модель для агента)</h3>
        <Badge variant="outline" className="text-[10px]">dev/mock</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Эти фильтры агент выставляет на реальной странице ATI. API ATI не используется.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Откуда</Label><Input value={v.from_city ?? ""} onChange={(e) => set("from_city", e.target.value)} /></div>
        <div><Label className="text-xs">Радиус откуда, км</Label><Input type="number" value={v.from_radius_km ?? ""} onChange={(e) => set("from_radius_km", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Куда</Label><Input value={v.to_city ?? ""} onChange={(e) => set("to_city", e.target.value)} /></div>
        <div><Label className="text-xs">Радиус куда, км</Label><Input type="number" value={v.to_radius_km ?? ""} onChange={(e) => set("to_radius_km", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Дистанция от, км</Label><Input type="number" value={v.min_distance_km ?? ""} onChange={(e) => set("min_distance_km", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Дистанция до, км</Label><Input type="number" value={v.max_distance_km ?? ""} onChange={(e) => set("max_distance_km", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Вес от, кг</Label><Input type="number" value={v.weight_from ?? ""} onChange={(e) => set("weight_from", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Вес до, кг</Label><Input type="number" value={v.weight_to ?? ""} onChange={(e) => set("weight_to", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Объём от, м³</Label><Input type="number" value={v.volume_from ?? ""} onChange={(e) => set("volume_from", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Объём до, м³</Label><Input type="number" value={v.volume_to ?? ""} onChange={(e) => set("volume_to", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Мин. ставка, ₽/км</Label><Input type="number" value={v.min_rate_rub_per_km ?? ""} onChange={(e) => set("min_rate_rub_per_km", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><Label className="text-xs">Мин. цена, ₽</Label><Input type="number" value={v.min_total_price ?? ""} onChange={(e) => set("min_total_price", e.target.value ? Number(e.target.value) : null)} /></div>
      </div>
      <div>
        <Label className="text-xs">Кузов</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {(Object.keys(ATI_BODY_TYPE_LABELS) as AtiBodyType[]).map((b) => (
            <label key={b} className="inline-flex items-center gap-1 text-xs">
              <Checkbox checked={(v.body_types ?? []).includes(b)} onCheckedChange={() => toggle("body_types", b)} />
              {ATI_BODY_TYPE_LABELS[b]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs">Загрузка</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {(Object.keys(ATI_LOADING_TYPE_LABELS) as AtiLoadingType[]).map((b) => (
            <label key={b} className="inline-flex items-center gap-1 text-xs">
              <Checkbox checked={(v.loading_types ?? []).includes(b)} onCheckedChange={() => toggle("loading_types", b)} />
              {ATI_LOADING_TYPE_LABELS[b]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs">Оплата</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {(Object.keys(ATI_PAYMENT_TYPE_LABELS) as AtiPaymentType[]).map((b) => (
            <label key={b} className="inline-flex items-center gap-1 text-xs">
              <Checkbox checked={(v.payment_types ?? []).includes(b)} onCheckedChange={() => toggle("payment_types", b)} />
              {ATI_PAYMENT_TYPE_LABELS[b]}
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* -------------------- Multi-vehicle -------------------- */

type ManualVehicle = {
  label: string;
  capacity_t?: number;
  volume_m3?: number;
  body_type?: string;
  start_city?: string;
};

export function MultiVehicleSearchBoard() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ManualVehicle[]>([{ label: "Авто 1" }]);
  const [filters, setFilters] = useState<AtiFilters>({ ...DEFAULT_ATI_FILTERS });
  const [groupId, setGroupId] = useState<string | null>(null);
  const startM = useMutation({
    mutationFn: async () => {
      const vehicles = rows.map((r) => ({
        manual_vehicle_json: r,
        start_city: r.start_city ?? null,
        ati_filters_json: filters,
        vehicle_params_json: { capacity_t: r.capacity_t, volume_m3: r.volume_m3, body_type: r.body_type },
      }));
      const res = await apiPost<{ group_id: string; task_ids: string[] }>(
        "/api/dispatcher/ai-dispatcher/multi-vehicle/start",
        { vehicles, ati_filters_json: filters },
      );
      return res;
    },
    onSuccess: (r) => {
      setGroupId(r.group_id);
      toast.success(`Группа запущена: ${r.task_ids.length} машин`);
      qc.invalidateQueries({ queryKey: ["ai-disp-tasks"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Не удалось запустить"),
  });
  const refreshM = useMutation({
    mutationFn: async () => {
      if (!groupId) return;
      await apiPost("/api/dispatcher/ai-dispatcher/multi-vehicle/refresh-cycle", { group_id: groupId });
    },
    onSuccess: () => {
      toast.success("Цикл обновления выполнен (mock)");
      qc.invalidateQueries({ queryKey: ["ai-disp-tasks"] });
    },
  });
  const stopM = useMutation({
    mutationFn: async () => {
      if (!groupId) return;
      await apiPost("/api/dispatcher/ai-dispatcher/multi-vehicle/stop", { group_id: groupId });
    },
    onSuccess: () => {
      toast.success("Группа остановлена");
      setGroupId(null);
      qc.invalidateQueries({ queryKey: ["ai-disp-tasks"] });
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Truck className="h-4 w-4" />Несколько автомобилей</h3>
        <Badge variant="outline" className="text-[10px]">dev/mock</Badge>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_80px_120px_120px_auto] gap-2 items-end">
            <div><Label className="text-[11px]">Метка</Label><Input value={r.label} onChange={(e) => { const cp = [...rows]; cp[i] = { ...r, label: e.target.value }; setRows(cp); }} /></div>
            <div><Label className="text-[11px]">Тн</Label><Input type="number" value={r.capacity_t ?? ""} onChange={(e) => { const cp = [...rows]; cp[i] = { ...r, capacity_t: e.target.value ? Number(e.target.value) : undefined }; setRows(cp); }} /></div>
            <div><Label className="text-[11px]">м³</Label><Input type="number" value={r.volume_m3 ?? ""} onChange={(e) => { const cp = [...rows]; cp[i] = { ...r, volume_m3: e.target.value ? Number(e.target.value) : undefined }; setRows(cp); }} /></div>
            <div><Label className="text-[11px]">Кузов</Label><Input value={r.body_type ?? ""} onChange={(e) => { const cp = [...rows]; cp[i] = { ...r, body_type: e.target.value }; setRows(cp); }} /></div>
            <div><Label className="text-[11px]">Город подачи</Label><Input value={r.start_city ?? ""} onChange={(e) => { const cp = [...rows]; cp[i] = { ...r, start_city: e.target.value }; setRows(cp); }} /></div>
            <Button variant="ghost" size="icon" onClick={() => setRows(rows.filter((_, x) => x !== i))}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { label: `Авто ${rows.length + 1}` }])}>Добавить машину</Button>
      </div>
      <AtiFilterModelBlock value={filters} onChange={setFilters} />
      <div className="flex flex-wrap gap-2">
        {!groupId
          ? <Button size="sm" onClick={() => startM.mutate()} disabled={startM.isPending || rows.length === 0}>Запустить группу</Button>
          : (
            <>
              <Button size="sm" onClick={() => refreshM.mutate()} disabled={refreshM.isPending}><RefreshCw className="h-3.5 w-3.5 mr-1" />Обновить цикл</Button>
              <Button size="sm" variant="destructive" onClick={() => stopM.mutate()}>Остановить группу</Button>
              <span className="text-[11px] text-muted-foreground self-center">Группа: {groupId.slice(0, 8)}</span>
            </>
          )}
      </div>
      {groupId && <MultiVehicleGroupTaskList groupId={groupId} />}
    </Card>
  );
}

function MultiVehicleGroupTaskList({ groupId }: { groupId: string }) {
  const q = useQuery({
    queryKey: ["ai-disp-tasks"],
    queryFn: () => apiGetAuth<{ rows: Array<Record<string, unknown>> }>("/api/dispatcher/ai-dispatcher/tasks"),
    refetchInterval: 20000,
  });
  const rows = (q.data?.rows ?? []).filter((r) => r["multi_vehicle_group_id"] === groupId);
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Задачи группы пока не созданы.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const mv = (r["manual_vehicle_json"] ?? {}) as { label?: string; capacity_t?: number; volume_m3?: number };
        return (
          <div key={String(r["id"])} className="text-xs border rounded p-2 flex items-center justify-between">
            <div>
              <div className="font-medium">{mv.label ?? "Авто"}</div>
              <div className="text-muted-foreground">
                {String(r["start_city"] ?? "—")} · {mv.capacity_t ?? "—"} т · {mv.volume_m3 ?? "—"} м³ ·
                статус {String(r["status"])}
              </div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              просмотрено {Number(r["loads_seen_count"] ?? 0)} · подходит {Number(r["matched_count"] ?? 0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Load Bundles -------------------- */

type BundleRow = {
  id: string;
  bundle_type: string;
  status: string;
  total_price: number | null;
  total_distance_km: number | null;
  total_weight: number | null;
  total_volume: number | null;
  remaining_weight: number | null;
  remaining_volume: number | null;
  total_profit: number | null;
  total_profit_per_km: number | null;
  ai_summary: string | null;
  risks_json: unknown;
  vehicle_id: string | null;
  created_at: string;
};

export function LoadBundlePanel() {
  const q = useQuery({
    queryKey: ["ai-disp-bundles"],
    queryFn: () => apiGetAuth<{ rows: BundleRow[] }>("/api/dispatcher/ai-dispatcher/bundles"),
    refetchInterval: 20000,
  });
  const rows = q.data?.rows ?? [];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Layers className="h-4 w-4" />Связки грузов</h3>
        <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Пока нет связок. Собирайте связку из кандидатов кнопкой «Сделать связку»
          или через API <code>POST /api/dispatcher/ai-dispatcher/bundles</code>.
        </p>
      )}
      <div className="space-y-2">
        {rows.map((b) => <LoadBundleCard key={b.id} bundle={b} />)}
      </div>
    </Card>
  );
}

function LoadBundleCard({ bundle }: { bundle: BundleRow }) {
  const qc = useQueryClient();
  const recalc = useMutation({
    mutationFn: async () => { await apiPost(`/api/dispatcher/ai-dispatcher/bundles/${bundle.id}/recalculate`, {}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-disp-bundles"] }); toast.success("Пересчитано"); },
  });
  const risks = Array.isArray(bundle.risks_json) ? (bundle.risks_json as string[]) : [];
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{bundle.bundle_type}</Badge>
          <Badge variant="outline" className="text-[10px]">{bundle.status}</Badge>
          <BundleScoreBadge bundle={bundle} />
        </div>
        <Button size="sm" variant="outline" onClick={() => recalc.mutate()}>
          <RefreshCw className="h-3 w-3 mr-1" />Пересчитать
        </Button>
      </div>
      <div className="text-xs">{bundle.ai_summary ?? "—"}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Metric label="Цена" value={fmtN(bundle.total_price)} />
        <Metric label="Расстояние" value={`${fmtN(bundle.total_distance_km)} км`} />
        <Metric label="Прибыль" value={`${fmtN(bundle.total_profit)} ₽`} />
        <Metric label="₽/км прибыли" value={String(bundle.total_profit_per_km ?? "—")} />
        <Metric label="Занято" value={`${fmtN(bundle.total_weight)} кг / ${fmtN(bundle.total_volume)} м³`} />
        <Metric label="Осталось" value={`${fmtN(bundle.remaining_weight)} кг / ${fmtN(bundle.remaining_volume)} м³`} />
      </div>
      {risks.length > 0 && (
        <div className="text-[11px] text-amber-700 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <div>{risks.join("; ")}</div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded px-2 py-1">
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function BundleScoreBadge({ bundle }: { bundle: BundleRow }) {
  const rate = Number(bundle.total_profit_per_km ?? 0);
  const good = rate >= 20;
  return <Badge className={good ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}>{good ? "выгодно" : "слабо"}</Badge>;
}

function fmtN(v: number | null | undefined): string {
  if (v == null) return "—";
  return String(Math.round(Number(v)));
}

/* -------------------- Call Queue -------------------- */

type QueueRow = {
  id: string;
  candidate_id: string | null;
  bundle_id: string | null;
  priority: number;
  call_status: string;
  call_result: string | null;
  dispatcher_comment: string | null;
  created_at: string;
};

export function CallQueuePanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ai-disp-call-queue"],
    queryFn: () => apiGetAuth<{ rows: QueueRow[] }>("/api/dispatcher/ai-dispatcher/call-queue"),
    refetchInterval: 20000,
  });
  const patch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      await apiPatch(`/api/dispatcher/ai-dispatcher/call-queue/${id}`, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-disp-call-queue"] }),
  });
  const rows = q.data?.rows ?? [];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><PhoneCall className="h-4 w-4" />Очередь звонков</h3>
        <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">Пока пусто. Добавляйте кандидатов в очередь.</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="border rounded p-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">приоритет {r.priority}</Badge>
                <Badge variant="secondary" className="text-[10px]">{r.call_status}</Badge>
                {r.bundle_id && <Badge className="text-[10px] bg-indigo-600 text-white">связка</Badge>}
              </div>
              <div className="text-muted-foreground text-[10px]">{new Date(r.created_at).toLocaleString()}</div>
            </div>
            {r.dispatcher_comment && <div className="text-muted-foreground">{r.dispatcher_comment}</div>}
            <div className="flex flex-wrap gap-1">
              {[
                ["called", "Позвонил"],
                ["no_answer", "Не дозвонился"],
                ["price_changed", "Цена изменилась"],
                ["taken", "Груз забрали"],
                ["waiting", "Ждём ответ"],
                ["agreed", "Договорились"],
                ["rejected", "Отказ"],
              ].map(([res, label]) => (
                <Button
                  key={res}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() => patch.mutate({
                    id: r.id,
                    patch: { call_status: res === "agreed" ? "done" : res === "rejected" ? "done" : "in_progress", call_result: res },
                  })}
                >{label}</Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------- Suggested-bundle alert -------------------- */

export function BundleSuggestionAlert({ bundle }: { bundle: BundleRow }) {
  return (
    <Alert>
      <Layers className="h-4 w-4" />
      <AlertTitle>Найдена связка грузов</AlertTitle>
      <AlertDescription>{bundle.ai_summary ?? "—"}</AlertDescription>
    </Alert>
  );
}

/* -------------------- Open on ATI button -------------------- */

export function CandidateOpenOnAtiButton({ candidateId }: { candidateId: string }) {
  const m = useMutation({
    mutationFn: async () => {
      await apiPost(`/api/dispatcher/ai-dispatcher/candidates/${candidateId}/open-on-ati`, {});
    },
    onSuccess: () => toast.success("Агент открыл груз на ATI (mock)"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      <ExternalLink className="h-3 w-3 mr-1" />Открыть груз на ATI
    </Button>
  );
}

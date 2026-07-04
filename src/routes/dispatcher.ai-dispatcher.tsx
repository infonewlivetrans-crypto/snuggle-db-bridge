// /dispatcher/ai-dispatcher — AI-диспетчер.
// dev/Lovable mock: Radius Track Agent открывает реальный сайт ATI поверх,
// а не через API. API ATI не используется и не планируется.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiGetAuth, apiPost, apiPatch } from "@/lib/api-client";
import {
  Activity, AlertTriangle, ExternalLink, Pause, Phone, PlayCircle,
  RefreshCw, Search, Square, Target, Truck,
} from "lucide-react";

import { MultiVehicleSearchBoard, LoadBundlePanel, CallQueuePanel } from "@/components/ai-dispatcher/BundleAndMultiVehicle";
import {
  AgentConnectionPanel, AgentTabsPanel, AGENT_MODE_STORAGE_KEY,
  type AgentAdapterMode,
} from "@/components/ai-dispatcher/AgentConnectionPanel";

// Читаем режим адаптера агента из localStorage прямо во время запроса.
// Так же передаём его серверу как ?mode=..., чтобы existing apiPost() (без headers) работал.
function currentAgentMode(): AgentAdapterMode {
  if (typeof window === "undefined") return "mock";
  const v = window.localStorage.getItem(AGENT_MODE_STORAGE_KEY);
  return (v === "browser_agent_ready" || v === "browser_agent_live") ? v : "mock";
}
function withMode(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}mode=${currentAgentMode()}`;
}

export const Route = createFileRoute("/dispatcher/ai-dispatcher")({
  component: AiDispatcherPage,
});

type Vehicle = {
  id: string;
  vehicle_kind: string | null;
  home_city: string | null;
  state_number?: string | null;
  capacity_t?: number | null;
};
type Task = {
  id: string;
  search_mode: "main_load" | "additional_load";
  status: string;
  start_city: string | null;
  destination_city: string | null;
  vehicle_source: string;
  vehicle_params_json: Record<string, unknown> | null;
  manual_vehicle_json: Record<string, unknown> | null;
  refresh_interval_seconds: number;
  last_refresh_at: string | null;
  next_refresh_at: string | null;
  refresh_count: number;
  loads_seen_count: number;
  matched_count: number;
  best_candidate_id: string | null;
  main_load_candidate_id: string | null;
  auto_refresh_enabled: boolean;
  parent_task_id: string | null;
  created_at: string;
};
type Candidate = {
  id: string;
  search_task_id: string;
  source_page_url: string | null;
  source_external_ref: string | null;
  pickup_city: string | null;
  delivery_city: string | null;
  pickup_date: string | null;
  cargo_name: string | null;
  weight: number | null;
  volume: number | null;
  body_type: string | null;
  loading_type: string | null;
  price: number | null;
  payment_type: string | null;
  distance_km: number | null;
  price_per_km: number | null;
  match_score: number | null;
  ai_summary: string | null;
  ai_reasons: string[] | null;
  ai_warnings: string[] | null;
  is_main_load: boolean;
  is_additional_load: boolean;
  status: string;
  dispatcher_decision: string | null;
};
type AgentEvent = {
  id: string;
  event_type: string;
  message: string | null;
  created_at: string;
};
type CallLog = {
  id: string;
  candidate_id: string;
  call_status: string;
  call_result: string | null;
  comment: string | null;
  called_at: string | null;
  created_at: string;
};

function AiDispatcherPage() {
  const [mode, setMode] = useState<AgentAdapterMode>(() => currentAgentMode());
  useEffect(() => {
    const h = (e: Event) => setMode((e as CustomEvent).detail as AgentAdapterMode);
    window.addEventListener("rt-agent-mode-changed", h as EventListener);
    return () => window.removeEventListener("rt-agent-mode-changed", h as EventListener);
  }, []);
  const setModePersist = (m: AgentAdapterMode) => {
    window.localStorage.setItem(AGENT_MODE_STORAGE_KEY, m);
    window.dispatchEvent(new CustomEvent("rt-agent-mode-changed", { detail: m }));
  };
  return (
    <DispatcherShell>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 space-y-4">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI-диспетчер</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Радиус Трек не использует API ATI. Поиск выполняется Browser Agent на открытой странице пользователя.
              Диспетчер принимает решение сам: звонит, уточняет условия и подтверждает груз.
            </p>
          </div>
          <Badge variant="outline" className="text-[11px]">
            Режим: {mode === "mock" ? "Mock Agent" : mode === "browser_agent_ready" ? "Browser Agent Ready" : "Live (disabled)"}
          </Badge>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AgentConnectionPanel mode={mode} onModeChange={setModePersist} />
          <AgentTabsPanel />
        </div>
        <AiDispatcherInner />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <MultiVehicleSearchBoard />
          <div className="space-y-4">
            <LoadBundlePanel />
            <CallQueuePanel />
          </div>
        </div>
      </main>
    </DispatcherShell>
  );
}

function AiDispatcherInner() {
  const qc = useQueryClient();
  const tasksQ = useQuery({
    queryKey: ["ai-disp-tasks"],
    queryFn: () => apiGetAuth<{ rows: Task[] }>("/api/dispatcher/ai-dispatcher/tasks"),
    refetchInterval: 15000,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const tasks = tasksQ.data?.rows ?? [];
  useEffect(() => {
    if (!activeId && tasks.length > 0) setActiveId(tasks[0].id);
  }, [tasks, activeId]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-4">
        <VehicleSearchStartBlock onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["ai-disp-tasks"] });
          setActiveId(id);
        }} />
        <Card className="p-3">
          <div className="text-sm font-semibold mb-2">Задачи поиска</div>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет активных задач</p>
          ) : (
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={
                      "w-full text-left rounded-md px-2 py-1.5 text-xs border " +
                      (activeId === t.id ? "bg-primary/10 border-primary" : "border-transparent hover:bg-muted")
                    }
                  >
                    <div className="font-medium">
                      {t.search_mode === "additional_load" ? "Догруз" : "Основной"} ·{" "}
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-muted-foreground">
                      {t.start_city ?? "—"} → {t.destination_city ?? "—"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        {activeId ? <TaskWorkspace taskId={activeId} onChangeTask={setActiveId} /> : (
          <Card className="p-6 text-sm text-muted-foreground">
            Выберите задачу или создайте новую слева.
          </Card>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    starting: "bg-blue-100 text-blue-800",
    searching: "bg-amber-100 text-amber-800",
    main_found: "bg-emerald-100 text-emerald-800",
    paused: "bg-zinc-200 text-zinc-700",
    stopped: "bg-zinc-300 text-zinc-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

// ─────────────── Vehicle start block ───────────────
function VehicleSearchStartBlock({ onCreated }: { onCreated: (taskId: string) => void }) {
  const [tab, setTab] = useState<"existing" | "manual">("existing");
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-sm font-semibold mb-2">
        <Truck className="h-4 w-4" /> Автомобиль для поиска
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "manual")}>
        <TabsList className="w-full grid grid-cols-2 h-8">
          <TabsTrigger value="existing" className="text-xs">Из базы</TabsTrigger>
          <TabsTrigger value="manual" className="text-xs">Вручную</TabsTrigger>
        </TabsList>
        <TabsContent value="existing">
          <ExistingVehiclePicker onCreated={onCreated} />
        </TabsContent>
        <TabsContent value="manual">
          <ManualVehicleProfileForm onCreated={onCreated} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function ExistingVehiclePicker({ onCreated }: { onCreated: (taskId: string) => void }) {
  const vehiclesQ = useQuery({
    queryKey: ["ai-disp-vehicles"],
    queryFn: () => apiGetAuth<{ rows: Vehicle[] }>(
      "/api/dispatcher-vehicles?limit=100").catch(() => ({ rows: [] as Vehicle[] })),
  });
  const [vehicleId, setVehicleId] = useState<string>("");
  const [destination, setDestination] = useState("");
  const vehicles = vehiclesQ.data?.rows ?? [];
  const selected = vehicles.find((v) => v.id === vehicleId);
  const create = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Выберите автомобиль");
      const res = await apiPost<{ row: Task }>("/api/dispatcher/ai-dispatcher/tasks", {
        search_mode: "main_load",
        vehicle_source: "existing_vehicle",
        vehicle_id: vehicleId,
        start_city: selected.home_city,
        destination_city: destination || null,
        vehicle_params_json: {
          vehicle_kind: selected.vehicle_kind,
          home_city: selected.home_city,
        },
      });
      await apiPost(withMode(`/api/dispatcher/ai-dispatcher/tasks/${res.row.id}/agent/open-ati`));
      await apiPost(withMode(`/api/dispatcher/ai-dispatcher/tasks/${res.row.id}/agent/refresh-now`));
      return res.row;
    },
    onSuccess: (row) => { toast.success("Поиск запущен"); onCreated(row.id); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  return (
    <div className="space-y-2 mt-2">
      <Label className="text-xs">Автомобиль</Label>
      <Select value={vehicleId} onValueChange={setVehicleId}>
        <SelectTrigger className="h-8"><SelectValue placeholder="Выберите ТС" /></SelectTrigger>
        <SelectContent>
          {vehicles.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.vehicle_kind ?? "ТС"} · {v.home_city ?? "—"}
            </SelectItem>
          ))}
          {vehicles.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Нет машин</div>}
        </SelectContent>
      </Select>
      <Label className="text-xs">Направление (город выгрузки)</Label>
      <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Например, Москва" className="h-8" />
      <Button size="sm" className="w-full" disabled={!vehicleId || create.isPending} onClick={() => create.mutate()}>
        <Search className="h-3.5 w-3.5 mr-1" /> Искать груз для этой машины
      </Button>
    </div>
  );
}

function ManualVehicleProfileForm({ onCreated }: { onCreated: (taskId: string) => void }) {
  const [f, setF] = useState({
    start_city: "", start_radius_km: 100, destination_city: "",
    vehicle_kind: "тент", body_type: "тент", tonnage: 20, volume: 86,
    length_m: 13.6, width_m: 2.45, height_m: 2.7, loading_type: "задняя",
    min_price: 30000, min_price_per_km: 35, comment: "",
  });
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiPost<{ row: Task }>("/api/dispatcher/ai-dispatcher/tasks", {
        search_mode: "main_load",
        vehicle_source: "manual_profile",
        start_city: f.start_city || null,
        start_radius_km: f.start_radius_km,
        destination_city: f.destination_city || null,
        manual_vehicle_json: f,
        vehicle_params_json: f,
        notes: f.comment || null,
      });
      await apiPost(withMode(`/api/dispatcher/ai-dispatcher/tasks/${res.row.id}/agent/open-ati`));
      await apiPost(withMode(`/api/dispatcher/ai-dispatcher/tasks/${res.row.id}/agent/refresh-now`));
      return res.row;
    },
    onSuccess: (row) => { toast.success("Профиль создан, поиск запущен"); onCreated(row.id); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const setVal = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-2 mt-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Город подачи</Label><Input className="h-8" value={f.start_city} onChange={(e) => setVal("start_city", e.target.value)} /></div>
        <div><Label>Радиус, км</Label><Input className="h-8" type="number" value={f.start_radius_km} onChange={(e) => setVal("start_radius_km", Number(e.target.value))} /></div>
        <div className="col-span-2"><Label>Направление</Label><Input className="h-8" value={f.destination_city} onChange={(e) => setVal("destination_city", e.target.value)} /></div>
        <div><Label>Тип кузова</Label><Input className="h-8" value={f.body_type} onChange={(e) => setVal("body_type", e.target.value)} /></div>
        <div><Label>Загрузка</Label><Input className="h-8" value={f.loading_type} onChange={(e) => setVal("loading_type", e.target.value)} /></div>
        <div><Label>Тоннаж, т</Label><Input className="h-8" type="number" value={f.tonnage} onChange={(e) => setVal("tonnage", Number(e.target.value))} /></div>
        <div><Label>Объём, м³</Label><Input className="h-8" type="number" value={f.volume} onChange={(e) => setVal("volume", Number(e.target.value))} /></div>
        <div><Label>Мин. ставка ₽</Label><Input className="h-8" type="number" value={f.min_price} onChange={(e) => setVal("min_price", Number(e.target.value))} /></div>
        <div><Label>Мин. ₽/км</Label><Input className="h-8" type="number" value={f.min_price_per_km} onChange={(e) => setVal("min_price_per_km", Number(e.target.value))} /></div>
      </div>
      <Textarea placeholder="Комментарий" rows={2} value={f.comment} onChange={(e) => setVal("comment", e.target.value)} />
      <Button size="sm" className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
        <Search className="h-3.5 w-3.5 mr-1" /> Создать быстрый профиль и искать груз
      </Button>
    </div>
  );
}

// ─────────────── Workspace ───────────────
function TaskWorkspace({ taskId, onChangeTask }: { taskId: string; onChangeTask: (id: string) => void }) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["ai-disp-task", taskId],
    queryFn: () => apiGetAuth<{ task: Task; candidates: Candidate[]; events: AgentEvent[] }>(
      `/api/dispatcher/ai-dispatcher/tasks/${taskId}`),
    refetchInterval: 10000,
  });
  const callsQ = useQuery({
    queryKey: ["ai-disp-calls", taskId],
    queryFn: () => apiGetAuth<{ rows: CallLog[] }>(
      `/api/dispatcher/ai-dispatcher/tasks/${taskId}/call-list`),
    refetchInterval: 15000,
  });

  const task = detailQ.data?.task;
  const candidates = detailQ.data?.candidates ?? [];
  const events = detailQ.data?.events ?? [];
  const calls = callsQ.data?.rows ?? [];
  const mainCand = candidates.find((c) => c.is_main_load) ?? null;
  const matched = candidates.filter((c) => (c.match_score ?? 0) >= 60 && !c.is_main_load);
  const additional = candidates.filter((c) => c.is_additional_load);
  const newSuitable = matched.find((c) => c.status === "suitable" && !c.dispatcher_decision) ?? null;

  // Auto refresh каждую минуту, пока auto_refresh_enabled.
  useEffect(() => {
    if (!task || !task.auto_refresh_enabled) return;
    if (task.status !== "searching") return;
    const interval = (task.refresh_interval_seconds ?? 60) * 1000;
    const timer = setInterval(() => {
      apiPost(withMode(`/api/dispatcher/ai-dispatcher/tasks/${task.id}/agent/refresh-now`)).then(() => {
        qc.invalidateQueries({ queryKey: ["ai-disp-task", task.id] });
      }).catch(() => undefined);
    }, interval);
    return () => clearInterval(timer);
  }, [task, qc]);

  const refresh = useMutation({
    mutationFn: () => apiPost(withMode(`/api/dispatcher/ai-dispatcher/tasks/${taskId}/agent/refresh-now`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] }),
  });
  const pause = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/tasks/${taskId}/agent/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] }),
  });
  const startAgent = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/tasks/${taskId}/agent/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] }),
  });
  const stop = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/tasks/${taskId}/agent/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] }),
  });

  if (!task) return <Card className="p-4 text-sm">Загрузка…</Card>;

  return (
    <div className="space-y-4">
      {/* Agent control */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4" /> Статус агента: <StatusBadge status={task.status} />
            <span className="text-xs text-muted-foreground">
              Обновлений: {task.refresh_count} · Просмотрено: {task.loads_seen_count} · Подходит: {task.matched_count}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить сейчас
            </Button>
            {task.auto_refresh_enabled ? (
              <Button size="sm" variant="outline" onClick={() => pause.mutate()}>
                <Pause className="h-3.5 w-3.5 mr-1" /> Пауза
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => startAgent.mutate()}>
                <PlayCircle className="h-3.5 w-3.5 mr-1" /> Продолжить
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => stop.mutate()}>
              <Square className="h-3.5 w-3.5 mr-1" /> Остановить
            </Button>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Последнее обновление: {fmt(task.last_refresh_at)} · Следующее: {fmt(task.next_refresh_at)}
        </div>
        <div className="text-[11px] text-amber-700 mt-1">
          Если не авторизованы в ATI — войдите вручную в открытой вкладке. Радиус Трек не хранит логин и пароль.
        </div>
      </Card>

      {/* Suitable alert */}
      {newSuitable && (
        <SuitableLoadAlert candidate={newSuitable} taskId={taskId} onAction={() => {
          qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] });
        }} />
      )}

      {/* Main load */}
      {mainCand && <MainLoadPanel candidate={mainCand} onAdditional={(newTaskId) => onChangeTask(newTaskId)} />}

      {/* Candidates table */}
      <LoadCandidateTable
        title={task.search_mode === "additional_load" ? "Кандидаты-догрузы" : "Найденные подходящие грузы"}
        candidates={candidates.filter((c) => !c.is_main_load)}
        taskId={taskId}
        onRefresh={() => {
          qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] });
          qc.invalidateQueries({ queryKey: ["ai-disp-calls", taskId] });
        }}
        mainCandidateId={mainCand?.id ?? null}
      />

      {/* Additional candidates summary */}
      {additional.length > 0 && (
        <Card className="p-3">
          <div className="text-sm font-semibold mb-1">Догрузы по этой задаче: {additional.length}</div>
          <div className="text-xs text-muted-foreground">
            Используется маршрут основного груза, остаток веса/объёма и допустимые отклонения.
          </div>
        </Card>
      )}

      {/* Call list */}
      <CallListPanel calls={calls} candidates={candidates} onChanged={() => {
        qc.invalidateQueries({ queryKey: ["ai-disp-calls", taskId] });
      }} />

      {/* Live agent feed */}
      <LiveAgentReadPanel taskId={taskId} events={events} task={task} />

      {/* Events */}
      <AgentEventLog events={events} />
    </div>
  );
}

function fmt(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleTimeString(); } catch { return s; }
}

function SuitableLoadAlert({ candidate, taskId, onAction }: {
  candidate: Candidate; taskId: string; onAction: () => void;
}) {
  const focus = useMutation({
    mutationFn: () => apiPost(withMode(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/focus`)),
    onSuccess: () => onAction(),
  });
  const makeMain = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/make-main`),
    onSuccess: () => { toast.success("Основной груз выбран"); onAction(); },
  });
  const addToCall = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/add-to-call-list`),
    onSuccess: () => { toast.success("В звонки"); onAction(); },
  });
  const skip = useMutation({
    mutationFn: () => apiPatch(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}`,
      { dispatcher_decision: "skip", status: "skipped" }),
    onSuccess: () => onAction(),
  });
  return (
    <Card className="p-4 border-amber-400 bg-amber-50">
      <div className="flex items-center gap-2 text-amber-900 font-semibold">
        <AlertTriangle className="h-5 w-5" /> Найден подходящий груз
      </div>
      <div className="mt-2 text-sm">
        <div className="font-medium">{candidate.pickup_city} → {candidate.delivery_city}</div>
        <div className="text-xs text-muted-foreground">
          {candidate.cargo_name ?? "—"} · {candidate.weight ?? "—"} кг · {candidate.volume ?? "—"} м³ ·
          {" "}ставка {candidate.price ?? "—"} ₽ ({candidate.price_per_km ?? "—"} ₽/км) ·
          {" "}score {candidate.match_score ?? "—"}
        </div>
        {candidate.ai_summary && <div className="text-xs mt-1">{candidate.ai_summary}</div>}
        {candidate.ai_reasons && candidate.ai_reasons.length > 0 && (
          <div className="text-xs text-emerald-700 mt-1">+ {candidate.ai_reasons.join(", ")}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" onClick={() => {
          focus.mutate();
          if (candidate.source_page_url) window.open(candidate.source_page_url, "_blank");
        }}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Открыть груз
        </Button>
        <Button size="sm" variant="secondary" onClick={() => makeMain.mutate()}>
          <Target className="h-3.5 w-3.5 mr-1" /> Сделать основным
        </Button>
        <Button size="sm" variant="outline" onClick={() => addToCall.mutate()}>
          <Phone className="h-3.5 w-3.5 mr-1" /> Взять в звонок
        </Button>
        <Button size="sm" variant="ghost" onClick={() => skip.mutate()}>Не подходит</Button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        Используется задача {taskId.slice(0, 8)}…
      </div>
    </Card>
  );
}

function MainLoadPanel({ candidate, onAdditional }: {
  candidate: Candidate; onAdditional: (taskId: string) => void;
}) {
  const startAdd = useMutation({
    mutationFn: () => apiPost<{ row: Task }>(
      `/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/start-additional-search`),
    onSuccess: (res) => {
      toast.success("Поиск догруза запущен");
      onAdditional(res.row.id);
    },
  });
  const remainingWeight = Math.max(0, 20000 - (candidate.weight ?? 0));
  const remainingVolume = Math.max(0, 86 - (candidate.volume ?? 0));
  return (
    <Card className="p-3 border-emerald-300 bg-emerald-50/60">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
          <Target className="h-4 w-4" /> Основной груз: {candidate.pickup_city} → {candidate.delivery_city}
        </div>
        <Button size="sm" onClick={() => startAdd.mutate()} disabled={startAdd.isPending}>
          <Search className="h-3.5 w-3.5 mr-1" /> Найти догруз
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-2">
        <Field label="Ставка" value={`${candidate.price ?? "—"} ₽`} />
        <Field label="₽/км" value={String(candidate.price_per_km ?? "—")} />
        <Field label="Вес" value={`${candidate.weight ?? "—"} кг`} />
        <Field label="Объём" value={`${candidate.volume ?? "—"} м³`} />
        <Field label="Остаток вес" value={`${remainingWeight} кг`} />
        <Field label="Остаток объём" value={`${remainingVolume} м³`} />
        <Field label="Дата загрузки" value={candidate.pickup_date ?? "—"} />
        <Field label="Кузов" value={candidate.body_type ?? "—"} />
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function LoadCandidateTable({
  title, candidates, onRefresh, mainCandidateId,
}: {
  title: string; candidates: Candidate[]; taskId: string;
  onRefresh: () => void; mainCandidateId: string | null;
}) {
  const sorted = useMemo(() =>
    [...candidates].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)),
    [candidates]);
  if (sorted.length === 0) {
    return <Card className="p-3 text-xs text-muted-foreground">{title}: пока пусто. Агент обновляет выдачу.</Card>;
  }
  return (
    <Card className="p-3">
      <div className="text-sm font-semibold mb-2">{title} ({sorted.length})</div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {sorted.map((c) => <LoadCandidateCard key={c.id} candidate={c}
          isMain={c.id === mainCandidateId} onRefresh={onRefresh} />)}
      </div>
    </Card>
  );
}

function LoadCandidateCard({ candidate, isMain, onRefresh }: {
  candidate: Candidate; isMain: boolean; onRefresh: () => void;
}) {
  const focus = useMutation({
    mutationFn: () => apiPost(withMode(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/focus`)),
    onSuccess: onRefresh,
  });
  const makeMain = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/make-main`),
    onSuccess: () => { toast.success("Назначен основным"); onRefresh(); },
  });
  const addToCall = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${candidate.id}/add-to-call-list`),
    onSuccess: () => { toast.success("В звонки"); onRefresh(); },
  });
  const score = candidate.match_score ?? 0;
  const scoreClass = score >= 75 ? "bg-emerald-600" : score >= 60 ? "bg-amber-500" : "bg-zinc-400";
  return (
    <div className="border rounded-md p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">
            {candidate.pickup_city} → {candidate.delivery_city}
            {isMain && <Badge className="ml-2 bg-emerald-600 text-white">Основной</Badge>}
            {candidate.is_additional_load && <Badge variant="secondary" className="ml-2">Догруз</Badge>}
          </div>
          <div className="text-muted-foreground">
            {candidate.cargo_name ?? "—"} · {candidate.weight ?? "—"} кг · {candidate.volume ?? "—"} м³ · {candidate.body_type ?? "—"}
          </div>
          <div className="text-muted-foreground">
            {candidate.price ?? "—"} ₽ ({candidate.price_per_km ?? "—"} ₽/км) · {candidate.distance_km ?? "—"} км · {candidate.payment_type ?? "—"}
          </div>
        </div>
        <Badge className={`${scoreClass} text-white`}>{score}</Badge>
      </div>
      {candidate.ai_warnings && candidate.ai_warnings.length > 0 && (
        <div className="text-amber-700 mt-1">⚠ {candidate.ai_warnings.join(", ")}</div>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
          focus.mutate();
          if (candidate.source_page_url) window.open(candidate.source_page_url, "_blank");
        }}>
          <ExternalLink className="h-3 w-3 mr-1" /> Провалиться в груз на ATI
        </Button>
        {!isMain && !candidate.is_additional_load && (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => makeMain.mutate()}>
            Сделать основным
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addToCall.mutate()}>
          <Phone className="h-3 w-3 mr-1" /> В звонки
        </Button>
      </div>
    </div>
  );
}

function CallListPanel({ calls, candidates, onChanged }: {
  calls: CallLog[]; candidates: Candidate[]; onChanged: () => void;
}) {
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  if (calls.length === 0) {
    return <Card className="p-3 text-xs text-muted-foreground">Список звонков пуст. Добавляйте кандидатов кнопкой «В звонки».</Card>;
  }
  return (
    <Card className="p-3">
      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Phone className="h-4 w-4" /> Список для звонков
      </div>
      <div className="space-y-2">
        {calls.map((cl) => {
          const c = byId.get(cl.candidate_id);
          return <CallRow key={cl.id} call={cl} candidate={c ?? null} onChanged={onChanged} />;
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        Система не звонит сама. Диспетчер звонит сам и фиксирует результат.
      </div>
    </Card>
  );
}

function CallRow({ call, candidate, onChanged }: {
  call: CallLog; candidate: Candidate | null; onChanged: () => void;
}) {
  const [comment, setComment] = useState(call.comment ?? "");
  const submit = useMutation({
    mutationFn: (result: string) => apiPost(
      `/api/dispatcher/ai-dispatcher/candidates/${call.candidate_id}/call-result`,
      { call_status: "called", call_result: result, comment }),
    onSuccess: () => { toast.success("Результат записан"); onChanged(); },
  });
  return (
    <div className="border rounded-md p-2 text-xs">
      <div className="font-medium">
        {candidate ? `${candidate.pickup_city} → ${candidate.delivery_city}` : call.candidate_id.slice(0, 8)}
        {" "}· {candidate?.price ?? "—"} ₽ · score {candidate?.match_score ?? "—"}
      </div>
      <div className="text-muted-foreground">
        Статус: {call.call_status} {call.call_result ? `· ${call.call_result}` : ""}
      </div>
      <Input className="h-7 mt-1" placeholder="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex flex-wrap gap-1 mt-1">
        {["Договорились", "Не дозвонился", "Груз забрали", "Цена не актуальна", "Ждём ответ", "Отказ"].map((r) => (
          <Button key={r} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => submit.mutate(r)}>
            {r}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AgentEventLog({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Card className="p-3">
      <div className="text-sm font-semibold mb-2">Журнал агента</div>
      <ul className="space-y-1 text-xs max-h-[300px] overflow-y-auto">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2">
            <span className="text-muted-foreground w-16 shrink-0">{fmt(e.created_at)}</span>
            <span className="font-mono text-[10px] text-muted-foreground w-44 shrink-0">{e.event_type}</span>
            <span>{e.message ?? ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

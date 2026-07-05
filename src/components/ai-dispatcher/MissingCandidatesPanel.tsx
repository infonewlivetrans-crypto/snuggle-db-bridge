// Block 3B — MissingCandidatesPanel: пропавшие / неактуальные / архивные / снова появившиеся грузы.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { RefreshCw, ExternalLink, Undo2, Archive, XCircle, Phone, Search } from "lucide-react";

type Group = "missing_1" | "missing_2" | "not_actual" | "archived" | "reappeared";
type Row = {
  id: string;
  search_task_id: string;
  status: string;
  not_actual_reason: string | null;
  missing_seen_count: number;
  last_missing_at: string | null;
  last_seen_at: string | null;
  seen_count: number;
  pickup_city: string | null;
  delivery_city: string | null;
  cargo_name: string | null;
  weight: number | null;
  volume: number | null;
  price: number | null;
  price_per_km: number | null;
  match_score: number | null;
  updated_at: string;
  dispatcher_comment: string | null;
  group: Group;
};

const GROUP_LABEL: Record<Group, string> = {
  missing_1: "Пропал 1 цикл",
  missing_2: "Пропал 2 цикла",
  not_actual: "Вероятно неактуален",
  archived: "Закрыт диспетчером",
  reappeared: "Снова появился",
};

const GROUP_ORDER: Group[] = ["reappeared", "missing_1", "missing_2", "not_actual", "archived"];

type Filter = "all" | Group;
type Sort = "recent_missing" | "recent_reappeared" | "price" | "score" | "missing_count";

export function MissingCandidatesPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ai-disp-missing", taskId],
    queryFn: () => apiGetAuth<{ rows: Row[] }>(
      `/api/dispatcher/ai-dispatcher/tasks/${taskId}/missing-candidates`),
    refetchInterval: 15000,
  });
  const rows = q.data?.rows ?? [];
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent_missing");

  const counters = useMemo(() => {
    const c: Record<Group, number> = {
      missing_1: 0, missing_2: 0, not_actual: 0, archived: 0, reappeared: 0,
    };
    for (const r of rows) c[r.group] = (c[r.group] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = filter === "all" ? rows.slice() : rows.filter((r) => r.group === filter);
    list.sort((a, b) => {
      switch (sort) {
        case "recent_missing":
          return (b.last_missing_at ?? "").localeCompare(a.last_missing_at ?? "");
        case "recent_reappeared":
          return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
        case "price":
          return (b.price ?? 0) - (a.price ?? 0);
        case "score":
          return (b.match_score ?? 0) - (a.match_score ?? 0);
        case "missing_count":
          return (b.missing_seen_count ?? 0) - (a.missing_seen_count ?? 0);
      }
    });
    return list;
  }, [rows, filter, sort]);

  const grouped = useMemo(() => {
    const map = new Map<Group, Row[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const r of filtered) map.get(r.group)?.push(r);
    return map;
  }, [filtered]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ai-disp-missing", taskId] });
    qc.invalidateQueries({ queryKey: ["ai-disp-task", taskId] });
  };

  const restore = useMutation({
    mutationFn: (id: string) => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${id}/restore`),
    onSuccess: () => { toast.success("Кандидат восстановлен"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось восстановить"),
  });
  const archive = useMutation({
    mutationFn: (id: string) => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${id}/archive`),
    onSuccess: () => { toast.success("Отправлено в архив"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось архивировать"),
  });
  const recheck = useMutation({
    mutationFn: (id: string) => apiPost<{ command_id: string | null }>(
      `/api/dispatcher/ai-dispatcher/candidates/${id}/recheck`),
    onSuccess: (r) => {
      toast.success(r?.command_id ? "Команда перечитать отправлена" : "Recheck: агент не подключён, запланировано");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось запросить recheck"),
  });
  const markNotActual = useMutation({
    mutationFn: (id: string) => apiPost(
      `/api/dispatcher/ai-dispatcher/candidates/${id}/mark-not-actual`, { reason: "not_actual" }),
    onSuccess: () => { toast.success("Помечено неактуальным"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Ошибка"),
  });
  const openAti = useMutation({
    mutationFn: (id: string) => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${id}/open-on-ati`, {}),
    onSuccess: () => toast.success("Открыто на ATI"),
    onError: (e: Error) => toast.error(e.message ?? "Не найдено на ATI"),
  });
  const addCall = useMutation({
    mutationFn: (id: string) => apiPost(`/api/dispatcher/ai-dispatcher/candidates/${id}/add-to-call-list`),
    onSuccess: () => { toast.success("Добавлено в звонки"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Ошибка"),
  });

  return (
    <Card className="p-3" id="missing-candidates-panel" data-task-id={taskId}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Search className="h-4 w-4" /> Пропавшие и неактуальные грузы
          <Button
            size="sm" variant="ghost"
            onClick={() => qc.invalidateQueries({ queryKey: ["ai-disp-missing", taskId] })}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              {GROUP_ORDER.map((g) => (
                <SelectItem key={g} value={g}>
                  {GROUP_LABEL[g]} ({counters[g]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 text-xs w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent_missing">Последние пропавшие</SelectItem>
              <SelectItem value="recent_reappeared">Последние появившиеся</SelectItem>
              <SelectItem value="price">По ставке</SelectItem>
              <SelectItem value="score">По score</SelectItem>
              <SelectItem value="missing_count">По количеству пропусков</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
        {GROUP_ORDER.map((g) => (
          <Badge key={g} variant="outline" className="text-[10px]">
            {GROUP_LABEL[g]}: <span className="ml-1 font-semibold">{counters[g]}</span>
          </Badge>
        ))}
      </div>

      {q.isLoading ? <p className="text-xs text-muted-foreground">Загрузка…</p> :
        rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Пропавших или неактуальных грузов пока нет.
          </p>
        ) : (
          <div className="space-y-4">
            {GROUP_ORDER.map((g) => {
              const list = grouped.get(g) ?? [];
              if (list.length === 0) return null;
              return (
                <section key={g}>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                    {GROUP_LABEL[g]} · {list.length}
                  </div>
                  <ul className="space-y-2">
                    {list.map((r) => (
                      <li key={r.id} className="rounded border p-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-sm font-medium">
                            {r.pickup_city ?? "—"} → {r.delivery_city ?? "—"}
                            {r.cargo_name ? <span className="ml-2 text-muted-foreground">· {r.cargo_name}</span> : null}
                            {r.group === "reappeared" && (
                              <Badge variant="default" className="ml-2 bg-emerald-600">Снова появился</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.price ? `${r.price.toLocaleString()} ₽` : "—"}
                            {r.price_per_km ? ` · ${r.price_per_km} ₽/км` : ""}
                            {r.match_score != null ? ` · score ${r.match_score}` : ""}
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Пропусков: {r.missing_seen_count} · Виден: {r.seen_count} раз ·
                          Последнее missing: {fmt(r.last_missing_at)} ·
                          Последнее seen: {fmt(r.last_seen_at)} ·
                          Статус: <span className="font-medium">{r.status}</span>
                          {r.not_actual_reason ? ` · Причина: ${r.not_actual_reason}` : ""}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => recheck.mutate(r.id)}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Перечитать
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openAti.mutate(r.id)}>
                            <ExternalLink className="h-3 w-3 mr-1" /> Открыть на ATI
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>
                            <Undo2 className="h-3 w-3 mr-1" /> Вернуть
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => markNotActual.mutate(r.id)}>
                            <XCircle className="h-3 w-3 mr-1" /> Неактуально
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => archive.mutate(r.id)}>
                            <Archive className="h-3 w-3 mr-1" /> Архив
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => addCall.mutate(r.id)}>
                            <Phone className="h-3 w-3 mr-1" /> В звонки
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
    </Card>
  );
}

/** Badge для карточки задачи: сколько кандидатов пропало. */
export function MissingCandidatesBadge({ taskId }: { taskId: string }) {
  const q = useQuery({
    queryKey: ["ai-disp-missing", taskId],
    queryFn: () => apiGetAuth<{ rows: Row[] }>(
      `/api/dispatcher/ai-dispatcher/tasks/${taskId}/missing-candidates`),
    refetchInterval: 30000,
  });
  const count = (q.data?.rows ?? []).filter((r) => r.group === "missing_1" || r.group === "missing_2").length;
  if (!count) return null;
  return (
    <button
      className="inline-flex"
      onClick={() => {
        const el = document.getElementById("missing-candidates-panel");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
        Пропавших: {count}
      </Badge>
    </button>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); }
  catch { return iso; }
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw, Send, Download, CheckCircle2, Clock } from "lucide-react";
import {
  backfillDriverInvitesFn,
  listDriverAccessStatusFn,
  type DriverAccessStatus,
} from "@/server/driver-access.functions";
import { rotateInviteTokenFn } from "@/server/invites.functions";
import { inviteUrl } from "@/lib/invite-url";

export function useDriverAccessStatus() {
  const fn = useServerFn(listDriverAccessStatusFn);
  return useQuery({
    queryKey: ["driver-access-status"],
    queryFn: () => fn({}),
    staleTime: 30_000,
  });
}

export function DriverAccessCell({
  status,
  onChanged,
}: {
  status: DriverAccessStatus | null;
  onChanged: () => void;
}) {
  const rotateFn = useServerFn(rotateInviteTokenFn);
  const rotate = useMutation({
    mutationFn: async (id: string) => rotateFn({ data: { id } }),
    onSuccess: (inv) => {
      const url = inviteUrl(inv.token);
      navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success("Новая ссылка скопирована");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!status) return <span className="text-xs text-muted-foreground">—</span>;

  if (status.hasUserId) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Активирован
      </span>
    );
  }
  if (status.token && status.isActive) {
    const url = inviteUrl(status.token);
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs text-status-warning">
          <Clock className="h-3.5 w-3.5" /> Ссылка выпущена
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => toast.success("Ссылка скопирована"),
              () => toast.error("Не удалось скопировать"),
            );
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => status.inviteId && rotate.mutate(status.inviteId)}
          disabled={rotate.isPending || !status.inviteId}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">Нет ссылки</span>;
}

export function DriverAccessBulkPanel({
  drivers,
  statusByDriverId,
}: {
  drivers: Array<{ id: string; full_name: string; is_active: boolean }>;
  statusByDriverId: Map<string, DriverAccessStatus>;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(backfillDriverInvitesFn);
  const [lastResult, setLastResult] = useState<{
    createdCount: number;
    errorCount: number;
  } | null>(null);

  const targets = useMemo(
    () =>
      drivers.filter((d) => {
        if (!d.is_active) return false;
        const s = statusByDriverId.get(d.id);
        if (!s) return true;
        return !s.hasUserId && !(s.token && s.isActive);
      }),
    [drivers, statusByDriverId],
  );

  const run = useMutation({
    mutationFn: () => fn({}),
    onSuccess: (r) => {
      setLastResult({ createdCount: r.createdCount, errorCount: r.errorCount });
      toast.success(
        `Выпущено ссылок: ${r.createdCount}${r.errorCount ? `, ошибок: ${r.errorCount}` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["driver-access-status"] });
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadCsv = () => {
    const rows: string[] = ["full_name,access_link,status"];
    for (const d of drivers) {
      const s = statusByDriverId.get(d.id);
      const status = s?.hasUserId
        ? "activated"
        : s?.token && s.isActive
          ? "link_issued"
          : "no_link";
      const link = s?.token ? inviteUrl(s.token) : "";
      const safeName = `"${d.full_name.replace(/"/g, '""')}"`;
      rows.push(`${safeName},${link},${status}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "driver-invites.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-sm font-medium">Доступ водителей</div>
        <div className="text-xs text-muted-foreground">
          Без ссылки и без аккаунта: {targets.length}
          {lastResult && ` · последний выпуск: +${lastResult.createdCount}, ошибок ${lastResult.errorCount}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadCsv}>
          <Download className="h-4 w-4" /> Экспорт CSV
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => run.mutate()}
          disabled={run.isPending || targets.length === 0}
        >
          <Send className="h-4 w-4" />
          {run.isPending ? "Выпуск…" : `Выпустить ссылки (${targets.length})`}
        </Button>
      </div>
    </div>
  );
}

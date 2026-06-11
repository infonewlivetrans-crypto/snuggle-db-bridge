import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { dispatcherEarningsApi } from "@/lib/dispatcher/api";
import {
  DISPATCHER_PAYOUT_STATUS_LABELS,
  type DispatcherPayoutStatus,
} from "@/lib/dispatcher/statuses";

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(Number(n)).toLocaleString("ru-RU")} ₽`;

export function EarningsTab() {
  const qc = useQueryClient();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dispatcher-earnings", { dateFrom, dateTo }],
    queryFn: () =>
      dispatcherEarningsApi.list({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const payMut = useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) =>
      dispatcherEarningsApi.setPayout(id, {
        dispatcher_payout_status: status,
        dispatcher_payout_comment: comment ?? null,
      }),
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["dispatcher-earnings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const rows = data?.rows ?? [];
  const s = data?.summary;
  const isAdmin = data?.is_admin ?? false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Ожидает" value={fmtMoney(s?.dispatcher_pending)} />
        <Kpi label="К выплате" value={fmtMoney(s?.dispatcher_ready)} />
        <Kpi label="Выплачено" value={fmtMoney(s?.dispatcher_paid)} />
        <Kpi label="Сделок" value={String(s?.total_count ?? 0)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40"
          placeholder="С"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40"
          placeholder="По"
        />
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сделка</TableHead>
              <TableHead>Маршрут</TableHead>
              <TableHead>Перевозчик</TableHead>
              <TableHead className="text-right">Комиссия сервиса</TableHead>
              <TableHead className="text-right">Доля диспетчера</TableHead>
              <TableHead className="text-right">Сумма диспетчера</TableHead>
              <TableHead>Статус выплаты</TableHead>
              <TableHead>Получена</TableHead>
              <TableHead>Выплачено</TableHead>
              {isAdmin && <TableHead>Диспетчер</TableHead>}
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={isAdmin ? 11 : 10} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={isAdmin ? 11 : 10} className="text-center text-muted-foreground">Нет начислений</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const status = (r.dispatcher_payout_status ?? "pending") as DispatcherPayoutStatus;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.deal_number ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.route_from ?? "—"} → {r.route_to ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.carrier_name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-right whitespace-nowrap">{fmtMoney(r.commission_amount)}</TableCell>
                  <TableCell className="text-xs text-right whitespace-nowrap">{r.dispatcher_commission_percent ?? 50}%</TableCell>
                  <TableCell className="text-xs text-right whitespace-nowrap font-medium">{fmtMoney(r.dispatcher_commission_amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={status} label={DISPATCHER_PAYOUT_STATUS_LABELS[status] ?? status} />
                  </TableCell>
                  <TableCell className="text-xs">{r.commission_received_at ? new Date(r.commission_received_at).toLocaleDateString("ru-RU") : "—"}</TableCell>
                  <TableCell className="text-xs">{r.dispatcher_paid_at ? new Date(r.dispatcher_paid_at).toLocaleDateString("ru-RU") : "—"}</TableCell>
                  {isAdmin && <TableCell className="text-xs">{r.dispatcher_user_label ?? "—"}</TableCell>}
                  <TableCell className="text-right whitespace-nowrap">
                    {isAdmin && status === "ready" && (
                      <Button size="sm" variant="default" onClick={() => payMut.mutate({ id: r.id, status: "paid" })}>
                        Отметить выплаченным
                      </Button>
                    )}
                    {isAdmin && status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => payMut.mutate({ id: r.id, status: "ready" })}>
                        К выплате
                      </Button>
                    )}
                    {isAdmin && status === "paid" && (
                      <span className="text-xs text-muted-foreground">Выплачено</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

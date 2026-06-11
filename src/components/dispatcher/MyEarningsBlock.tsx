import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dispatcherEarningsApi } from "@/lib/dispatcher/api";

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(Number(n)).toLocaleString("ru-RU")} ₽`;

// Stage 11.14 — компактный блок «Мой заработок» на /dispatcher.
export function MyEarningsBlock() {
  const { data, isLoading } = useQuery({
    queryKey: ["dispatcher-earnings", "self-summary"],
    queryFn: () => dispatcherEarningsApi.list({}),
    refetchInterval: 60_000,
  });

  const s = data?.summary;

  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Wallet className="h-5 w-5" />
          <span>Мой заработок</span>
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link to="/dispatcher/commissions">
            Открыть отчёт <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Ожидает" value={isLoading ? "…" : fmtMoney(s?.dispatcher_pending)} />
        <Cell
          label="К выплате"
          value={isLoading ? "…" : fmtMoney(s?.dispatcher_ready)}
          tone="ready"
        />
        <Cell label="Выплачено" value={isLoading ? "…" : fmtMoney(s?.dispatcher_paid)} />
        <Cell
          label="Сделок"
          value={isLoading ? "…" : String(s?.total_count ?? 0)}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ready";
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " +
        (tone === "ready"
          ? "border-emerald-300/40 bg-emerald-50/50 dark:bg-emerald-950/20"
          : "border-border bg-background")
      }
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

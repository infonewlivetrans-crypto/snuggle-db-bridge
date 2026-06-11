import { useQuery } from "@tanstack/react-query";
import { Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

interface Row {
  id: string;
  request_number: string | null;
  request_status: string;
  loading_city: string | null;
  unloading_city: string | null;
  rate_amount: number | null;
  commission_amount: number | null;
  carrier_comment: string | null;
  dispatcher_comment: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  carrier: { name: string | null } | null;
}

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";
const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;

function useBucket(bucket: "awaiting" | "declined") {
  return useQuery({
    queryKey: ["dispatcher-carrier-requests", bucket],
    queryFn: () =>
      apiGetAuth<{ rows: Row[] }>(
        `/api/dispatcher/carrier-requests/accepted?bucket=${bucket}`,
      ),
    refetchInterval: 60_000,
  });
}

export function CarrierResponsesOverviewBlock() {
  const awaitingQ = useBucket("awaiting");
  const declinedQ = useBucket("declined");
  const awaiting = awaitingQ.data?.rows ?? [];
  const declined = declinedQ.data?.rows ?? [];

  if (awaiting.length === 0 && declined.length === 0) return null;

  return (
    <section className="mb-6 grid gap-3 lg:grid-cols-2">
      {awaiting.length > 0 && (
        <Panel
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          title="Ожидают ответа перевозчика"
          count={awaiting.length}
          tone="amber"
        >
          {awaiting.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-card p-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-medium truncate">
                  № {r.request_number ?? r.id.slice(0, 8)}
                </span>
                <Badge variant="outline">
                  {r.request_status === "viewed" ? "Просмотрено" : "Отправлено"}
                </Badge>
              </div>
              <div className="text-muted-foreground truncate">
                {r.carrier?.name ?? "—"} · {r.loading_city ?? "—"} → {r.unloading_city ?? "—"}
              </div>
              <div className="text-muted-foreground">
                Отправлено: {fmtDate(r.sent_at ?? r.created_at)} · {fmtMoney(r.rate_amount)}
              </div>
            </div>
          ))}
        </Panel>
      )}

      {declined.length > 0 && (
        <Panel
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          title="Отказы перевозчиков"
          count={declined.length}
          tone="danger"
        >
          {declined.slice(0, 6).map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-card p-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-medium truncate">
                  № {r.request_number ?? r.id.slice(0, 8)}
                </span>
                <span className="text-muted-foreground">{fmtDate(r.responded_at)}</span>
              </div>
              <div className="text-muted-foreground truncate">
                {r.carrier?.name ?? "—"} · {r.loading_city ?? "—"} → {r.unloading_city ?? "—"}
              </div>
              {r.carrier_comment && (
                <div className="mt-1 rounded bg-muted/40 p-1 text-muted-foreground">
                  Причина: {r.carrier_comment}
                </div>
              )}
            </div>
          ))}
        </Panel>
      )}
    </section>
  );
}

function Panel({
  icon,
  title,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone?: "amber" | "danger";
  children: React.ReactNode;
}) {
  const borderClass =
    tone === "danger"
      ? "border-destructive/40"
      : tone === "amber"
        ? "border-amber-500/40"
        : "border-border";
  return (
    <div className={`rounded-lg border ${borderClass} bg-card p-3`}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

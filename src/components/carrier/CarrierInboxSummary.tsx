import { Link } from "@tanstack/react-router";
import { Inbox, BellRing, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCarrierRequestsQuery } from "@/components/carrier/CarrierRequestsBlock";

export function CarrierInboxSummary() {
  const { data, isLoading } = useCarrierRequestsQuery();
  const c = data?.counts ?? { sent: 0, viewed: 0, accepted: 0, declined: 0 };
  const newCount = c.sent ?? 0;
  const viewedCount = c.viewed ?? 0;
  const acceptedCount = c.accepted ?? 0;
  const declinedCount = c.declined ?? 0;
  const incomingTotal = newCount + viewedCount;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Входящие предложения</h2>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/carrier/trips">
              Открыть <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {newCount > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/50 bg-primary/5 p-2 text-sm">
            <BellRing className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="font-medium">Есть новые предложения рейсов</div>
              <div className="text-xs text-muted-foreground">
                {newCount} непрочитанных. Откройте «Задания / рейсы», чтобы ответить.
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat label="Новые" value={newCount} tone="primary" loading={isLoading} />
          <Stat label="Просмотренные" value={viewedCount} loading={isLoading} />
          <Stat label="Принятые" value={acceptedCount} tone="success" loading={isLoading} />
          <Stat label="Отказанные" value={declinedCount} loading={isLoading} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
  tone?: "primary" | "success";
  loading?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-lg font-semibold">{loading ? "…" : value}</span>
        {tone === "primary" && value > 0 && <Badge>новое</Badge>}
        {tone === "success" && value > 0 && (
          <Badge variant="secondary">ok</Badge>
        )}
      </div>
    </div>
  );
}

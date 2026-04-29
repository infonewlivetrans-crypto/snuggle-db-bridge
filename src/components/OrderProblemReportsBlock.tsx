import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  orderId: string;
}

type ProblemRow = {
  id: string;
  reason: string;
  comment: string | null;
  photo_url: string | null;
  urgency: "normal" | "urgent";
  reported_by: string | null;
  manager_name: string | null;
  created_at: string;
};

export function OrderProblemReportsBlock({ orderId }: Props) {
  const { data } = useQuery({
    queryKey: ["order-problem-reports", orderId],
    queryFn: async (): Promise<ProblemRow[]> => {
      const { data, error } = await supabase
        .from("order_problem_reports")
        .select("id, reason, comment, photo_url, urgency, reported_by, manager_name, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProblemRow[];
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-orange-700 dark:text-orange-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        Проблемы по заказу ({data.length})
      </div>
      <div className="space-y-2">
        {data.map((r) => (
          <div key={r.id} className="rounded border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{r.reason}</div>
              <Badge
                variant="outline"
                className={
                  r.urgency === "urgent"
                    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "border-slate-300 bg-slate-100 text-slate-700"
                }
              >
                {r.urgency === "urgent" ? "Срочная" : "Обычная"}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString("ru-RU")}
              {r.reported_by ? ` · ${r.reported_by}` : ""}
            </div>
            {r.comment && <div className="mt-1.5 text-sm">{r.comment}</div>}
            {r.photo_url && (
              <a
                href={r.photo_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Camera className="h-3 w-3" /> Открыть фото
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch } from "@/lib/api-client";

type CarrierProgressDeal = {
  id: string;
  deal_status: string;
  loading_started_at: string | null;
  in_transit_at: string | null;
  unloading_started_at: string | null;
  delivered_at: string | null;
  carrier_comment: string | null;
};

const STEPS: Array<{ status: "loading" | "in_transit" | "unloading" | "delivered"; label: string; stampField: keyof CarrierProgressDeal }> = [
  { status: "loading", label: "На загрузке", stampField: "loading_started_at" },
  { status: "in_transit", label: "В пути", stampField: "in_transit_at" },
  { status: "unloading", label: "На выгрузке", stampField: "unloading_started_at" },
  { status: "delivered", label: "Доставлено", stampField: "delivered_at" },
];

const TERMINAL_STATUSES = new Set([
  "waiting_customer_payment",
  "waiting_payment",
  "waiting_commission",
  "commission_received",
  "closed",
  "cancelled",
  "archived",
]);

export function CarrierTripProgressBlock({ deal }: { deal: CarrierProgressDeal }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState(deal.carrier_comment ?? "");

  const mut = useMutation({
    mutationFn: async (status: string) => {
      const body: Record<string, unknown> = { deal_status: status };
      if (comment.trim()) body.carrier_comment = comment.trim();
      const res = await apiFetchAuth(`/api/carrier/deals/${deal.id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Не удалось обновить статус");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Статус рейса обновлён");
      qc.invalidateQueries({ queryKey: ["carrier", "deals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const locked = TERMINAL_STATUSES.has(deal.deal_status);

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="text-xs font-semibold uppercase text-muted-foreground">
        Выполнение рейса
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        {STEPS.map((s) => {
          const ts = deal[s.stampField] as string | null;
          return (
            <div key={s.status} className="flex items-center justify-between rounded border bg-background px-2 py-1">
              <span className={ts ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
              {ts ? (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ts).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {locked ? (
        <div className="text-xs text-muted-foreground">
          Этап завершения сделки контролирует диспетчер.
        </div>
      ) : (
        <>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий перевозчика (необязательно)"
            className="min-h-[60px] text-sm"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((s) => (
              <Button
                key={s.status}
                size="sm"
                variant={deal.deal_status === s.status ? "default" : "outline"}
                disabled={mut.isPending}
                onClick={() => mut.mutate(s.status)}
                className="h-10"
              >
                {mut.isPending && mut.variables === s.status ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  s.label
                )}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

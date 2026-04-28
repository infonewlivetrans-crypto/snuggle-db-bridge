import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History } from "lucide-react";

type OrderHistoryRow = {
  id: string;
  changed_at: string;
  changed_by: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  created: "Создан",
  status: "Статус",
  payment_status: "Статус оплаты",
  payment_type: "Тип оплаты",
  amount_due: "Сумма к получению",
  delivery_cost: "Стоимость доставки",
  cash_received: "Наличные получены",
  qr_received: "QR получен",
  delivery_address: "Адрес доставки",
  marketplace: "Маркетплейс",
  client_works_weekends: "Клиент в выходные",
  requires_qr: "Требуется QR",
  comment: "Комментарий",
};

export function OrderHistory({ orderId }: { orderId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order_history", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderHistoryRow[]> => {
      const { data, error } = await supabase
        .from("order_history" as never)
        .select("*")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as OrderHistoryRow[];
    },
  });

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        История изменений
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm italic text-muted-foreground">Изменений пока нет</div>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {data.map((row) => (
            <li key={row.id} className="rounded-md border border-border bg-secondary/30 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {FIELD_LABELS[row.field] ?? row.field}
                </span>
                <span className="text-muted-foreground">
                  {new Date(row.changed_at).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {row.field !== "created" && (
                <div className="mt-1 text-foreground">
                  <span className="text-muted-foreground line-through">{row.old_value ?? "—"}</span>
                  {" → "}
                  <span className="font-medium">{row.new_value ?? "—"}</span>
                </div>
              )}
              {row.changed_by && (
                <div className="mt-1 text-muted-foreground">{row.changed_by}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

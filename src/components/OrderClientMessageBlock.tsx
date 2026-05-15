import { Button } from "@/components/ui/button";
import { Copy, Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { buildClientEtaMessage, copyToClipboard } from "@/lib/clientMessage";

/**
 * Блок «Сообщение клиенту»: автогенерация текста и кнопки.
 *
 * Прямые browser-запросы к Supabase (route_points / routes / delivery_routes /
 * drivers) временно отключены — на production они отдают 400. До отдельной
 * миграции на /api/* сообщение формируется без ETA (с заглушками времени),
 * звонок клиенту работает по переданному phone из props.
 */
export function OrderClientMessageBlock({
  orderNumber,
  clientPhone,
}: {
  orderId: string;
  orderNumber: string;
  clientPhone: string | null;
}) {
  const message = buildClientEtaMessage({
    orderNumber,
    etaAtIso: null,
    isLateRisk: false,
    driverName: null,
    driverPhone: null,
  });

  const handleCopy = async () => {
    const ok = await copyToClipboard(message);
    if (ok) toast.success("Сообщение скопировано");
    else toast.error("Не удалось скопировать");
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Сообщение клиенту
      </div>
      <textarea
        readOnly
        value={message}
        className="mb-3 min-h-[88px] w-full resize-y rounded-md border border-border bg-secondary/40 p-2 text-sm text-foreground"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
          <Copy className="h-3.5 w-3.5" />
          Скопировать сообщение
        </Button>
        <Button
          size="sm"
          variant="outline"
          asChild={!!clientPhone}
          disabled={!clientPhone}
          className="gap-1.5"
        >
          {clientPhone ? (
            <a href={`tel:${clientPhone.replace(/[^+\d]/g, "")}`}>
              <Phone className="h-3.5 w-3.5" />
              Позвонить клиенту
            </a>
          ) : (
            <span>
              <Phone className="h-3.5 w-3.5" />
              Позвонить клиенту
            </span>
          )}
        </Button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        ETA пока не рассчитан — текст сформирован с заглушками времени.
      </div>
    </div>
  );
}

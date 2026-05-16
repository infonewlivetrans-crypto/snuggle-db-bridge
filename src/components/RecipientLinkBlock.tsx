import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Copy, Check, Ban } from "lucide-react";
import { apiGetAuth, apiPost, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";

type LinkState = {
  token: string | null;
  enabled: boolean;
  createdAt: string | null;
  revokedAt: string | null;
};

export function RecipientLinkBlock({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["recipient-link", orderId],
    queryFn: () =>
      apiGetAuth<LinkState>(`/api/orders/${encodeURIComponent(orderId)}/recipient-link`),
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiPost<LinkState>(`/api/orders/${encodeURIComponent(orderId)}/recipient-link`),
    onSuccess: (res) => {
      qc.setQueryData(["recipient-link", orderId], res);
      toast.success("Ссылка готова");
    },
    onError: () => toast.error("Не удалось создать ссылку"),
  });

  const revokeMut = useMutation({
    mutationFn: () =>
      apiDelete(`/api/orders/${encodeURIComponent(orderId)}/recipient-link`),
    onSuccess: () => {
      qc.setQueryData(["recipient-link", orderId], {
        token: null,
        enabled: false,
        createdAt: null,
        revokedAt: new Date().toISOString(),
      });
      toast.success("Ссылка аннулирована");
    },
    onError: () => toast.error("Не удалось аннулировать ссылку"),
  });

  const url = data?.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${data.token}`
    : "";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <Label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Ссылка для получателя
      </Label>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Загрузка…</div>
      ) : data?.token ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={handleCopy} title="Скопировать">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => revokeMut.mutate()}
              disabled={revokeMut.isPending}
              title="Аннулировать"
            >
              <Ban className="h-4 w-4 text-rose-600" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Получатель увидит только информацию по этому заказу.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? "Создание…" : "Создать ссылку"}
          </Button>
          <div className="text-xs text-muted-foreground">
            Получатель увидит только информацию по этому заказу.
          </div>
        </div>
      )}
    </div>
  );
}

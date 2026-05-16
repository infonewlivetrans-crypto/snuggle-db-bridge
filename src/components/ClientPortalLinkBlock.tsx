import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, ShieldOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGetAuth, apiPost } from "@/lib/api-client";

type LinkState = {
  has_token: boolean;
  active: boolean;
  url: string | null;
  portal_token_created_at: string | null;
  portal_token_revoked_at: string | null;
};

export function ClientPortalLinkBlock({ clientId }: { clientId: string | null | undefined }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const enabled = !!clientId;

  const q = useQuery({
    queryKey: ["client-portal-link", clientId],
    enabled,
    queryFn: () => apiGetAuth<LinkState>(`/api/clients/${clientId}/portal-link`),
  });

  const createMut = useMutation({
    mutationFn: () => apiPost<LinkState>(`/api/clients/${clientId}/portal-link`),
    onSuccess: (data) => {
      qc.setQueryData(["client-portal-link", clientId], data);
      toast.success("Ссылка создана");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось создать ссылку"),
  });

  const revokeMut = useMutation({
    mutationFn: () => apiDelete<LinkState>(`/api/clients/${clientId}/portal-link`),
    onSuccess: (data) => {
      qc.setQueryData(["client-portal-link", clientId], data);
      toast.success("Ссылка аннулирована");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось аннулировать"),
  });

  if (!enabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
          <Link2 className="h-3.5 w-3.5" />
          Ссылка для клиента
        </div>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>У заказа не определён клиент. Ссылку создать нельзя.</span>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    const url = q.data?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Скопировано");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Ссылка для клиента
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка…</div>
      ) : q.isError ? (
        <div className="text-sm text-destructive">Не удалось получить состояние ссылки</div>
      ) : q.data?.active && q.data.url ? (
        <>
          <div className="flex gap-2">
            <Input value={q.data.url} readOnly onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={handleCopy} className="shrink-0">
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              По этой ссылке клиент увидит все свои заказы, связанные с его карточкой.
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => revokeMut.mutate()}
              disabled={revokeMut.isPending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <ShieldOff className="mr-1.5 h-4 w-4" />
              Аннулировать
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            По этой ссылке клиент увидит все свои заказы, связанные с его карточкой.
          </div>
          <Button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {createMut.isPending ? "Создание…" : "Создать ссылку"}
          </Button>
        </>
      )}
    </div>
  );
}

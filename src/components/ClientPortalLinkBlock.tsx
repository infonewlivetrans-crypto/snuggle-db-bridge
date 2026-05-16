import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, ShieldOff, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api-client";

type LinkState = {
  has_token: boolean;
  active: boolean;
  url: string | null;
  portal_token_created_at: string | null;
  portal_token_revoked_at: string | null;
  portal_access_enabled: boolean;
};

type PortalStatus = "active" | "disabled" | "revoked" | "absent";

function deriveStatus(s: LinkState | undefined): PortalStatus {
  if (!s || !s.has_token) return "absent";
  if (s.portal_token_revoked_at) return "revoked";
  if (s.portal_access_enabled) return "active";
  return "disabled";
}

function statusBadge(status: PortalStatus) {
  const map: Record<PortalStatus, { text: string; cls: string }> = {
    active: { text: "Активна", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
    disabled: { text: "Отключена", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
    revoked: { text: "Отозвана", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" },
    absent: { text: "Не выпущена", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[status];
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.text}</span>
  );
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

export function ClientPortalLinkBlock({ clientId }: { clientId: string | null | undefined }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const enabled = !!clientId;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-portal-link", clientId] });

  const q = useQuery({
    queryKey: ["client-portal-link", clientId],
    enabled,
    queryFn: () => apiGetAuth<LinkState>(`/api/clients/${clientId}/portal-link`),
  });

  const createMut = useMutation({
    mutationFn: () => apiPost<LinkState>(`/api/clients/${clientId}/portal-link`),
    onSuccess: (data) => {
      qc.setQueryData(["client-portal-link", clientId], data);
      invalidate();
      toast.success("Ссылка создана");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось создать ссылку"),
  });

  const rotateMut = useMutation({
    mutationFn: () => apiPost<LinkState>(`/api/clients/${clientId}/portal-link?rotate=1`),
    onSuccess: (data) => {
      qc.setQueryData(["client-portal-link", clientId], data);
      invalidate();
      toast.success("Выпущена новая ссылка");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось выпустить новую ссылку"),
  });

  const patchMut = useMutation({
    mutationFn: (enabledNext: boolean) =>
      apiPatch<LinkState>(`/api/clients/${clientId}/portal-link`, { enabled: enabledNext }),
    onSuccess: (data) => {
      qc.setQueryData(["client-portal-link", clientId], data);
      invalidate();
      toast.success(data.portal_access_enabled ? "Портал включён" : "Портал отключён");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось изменить состояние портала"),
  });

  const revokeMut = useMutation({
    mutationFn: () => apiDelete<LinkState>(`/api/clients/${clientId}/portal-link`),
    onSuccess: (data) => {
      qc.setQueryData(["client-portal-link", clientId], data);
      invalidate();
      toast.success("Ссылка отозвана");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось отозвать ссылку"),
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

  const status = deriveStatus(q.data);
  const createdAt = formatDate(q.data?.portal_token_created_at);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Ссылка для клиента
        </div>
        {q.data && statusBadge(status)}
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка…</div>
      ) : q.isError ? (
        <div className="text-sm text-destructive">Не удалось получить состояние ссылки</div>
      ) : status === "absent" ? (
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
      ) : (
        <>
          {status === "active" && q.data?.url ? (
            <div className="flex gap-2">
              <Input value={q.data.url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={handleCopy} className="shrink-0">
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Скопировано" : "Скопировать"}
              </Button>
            </div>
          ) : status === "disabled" ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
              Портал временно отключён. Старая ссылка перестала работать, но токен сохранён — можно включить обратно.
            </div>
          ) : (
            <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-200">
              Ссылка отозвана. Для восстановления доступа выпустите новую ссылку.
            </div>
          )}

          {createdAt && (
            <div className="text-[11px] text-muted-foreground">Токен создан: {createdAt}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                checked={status === "active"}
                disabled={
                  status === "revoked" || patchMut.isPending || !q.data?.has_token
                }
                onCheckedChange={(v) => patchMut.mutate(v)}
                id="portal-enabled-switch"
              />
              <label htmlFor="portal-enabled-switch" className="text-sm">
                Портал включён
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={rotateMut.isPending}>
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    Сгенерировать новую ссылку
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Выпустить новую ссылку?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Старая ссылка перестанет работать. Клиенту потребуется отправить новую ссылку.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setRotateOpen(false);
                        rotateMut.mutate();
                      }}
                    >
                      Выпустить новую
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {status !== "revoked" && (
                <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokeMut.isPending}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <ShieldOff className="mr-1.5 h-4 w-4" />
                      Отозвать ссылку
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Отозвать ссылку?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Ссылка перестанет работать. Восстановить её без выпуска новой ссылки будет нельзя.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setRevokeOpen(false);
                          revokeMut.mutate();
                        }}
                      >
                        Отозвать
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

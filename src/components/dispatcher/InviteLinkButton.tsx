import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkIcon, Copy, RefreshCcw, Ban } from "lucide-react";
import {
  invitesApi,
  dispatcherInviteUrl,
  type InviteEntityType,
  type InviteType,
  type InviteTokenDTO,
} from "@/lib/dispatcher/invites";

interface Props {
  entityType: InviteEntityType;
  entityId: string;
  inviteType: InviteType;
  /** Текст подсказки для подсказки кнопки */
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
}

/**
 * Кнопка «Создать ссылку регистрации» для перевозчика/водителя/машины.
 * Открывает диалог: показывает последнюю активную ссылку (если есть),
 * позволяет создать новую или отозвать существующую.
 */
export function InviteLinkButton({
  entityType,
  entityId,
  inviteType,
  label = "Ссылка регистрации",
  size = "sm",
  variant = "outline",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<InviteTokenDTO | null>(null);
  const [history, setHistory] = useState<InviteTokenDTO[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await invitesApi.list({
        entity_type: entityType,
        entity_id: entityId,
      });
      const rows = res.rows ?? [];
      const now = Date.now();
      const stillActive =
        rows.find(
          (r) =>
            !r.used_at &&
            !r.revoked_at &&
            (!r.expires_at || new Date(r.expires_at).getTime() > now),
        ) ?? null;
      setActive(stillActive);
      setHistory(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки ссылок");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = async () => {
    setLoading(true);
    try {
      const res = await invitesApi.create({
        invite_type: inviteType,
        related_entity_type: entityType,
        related_entity_id: entityId,
        expires_in_days: 14,
      });
      setActive(res.row);
      toast.success("Ссылка создана");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Отозвать ссылку?")) return;
    setLoading(true);
    try {
      await invitesApi.revoke(id);
      toast.success("Ссылка отозвана");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const copy = (token: string) => {
    const url = dispatcherInviteUrl(token);
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Ссылка скопирована"))
      .catch(() => toast.error("Не удалось скопировать"));
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={label}
      >
        <LinkIcon className="h-4 w-4 mr-1" />
        {size !== "icon" && <span>Ссылка</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Отправьте эту ссылку перевозчику/водителю — он откроет её без логина и заполнит анкету.
              Срок действия — 14 дней.
            </DialogDescription>
          </DialogHeader>

          {active ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Активная ссылка</Label>
                <div className="flex gap-2">
                  <Input readOnly value={dispatcherInviteUrl(active.token)} className="font-mono text-xs" />
                  <Button type="button" variant="secondary" onClick={() => copy(active.token)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Действует до{" "}
                  {active.expires_at
                    ? new Date(active.expires_at).toLocaleString("ru-RU")
                    : "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" onClick={() => revoke(active.id)} disabled={loading}>
                  <Ban className="h-4 w-4 mr-1" /> Отозвать
                </Button>
                <Button type="button" variant="outline" onClick={create} disabled={loading}>
                  <RefreshCcw className="h-4 w-4 mr-1" /> Создать новую
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Активной ссылки нет.</p>
              <Button type="button" onClick={create} disabled={loading}>
                Создать ссылку
              </Button>
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">История ссылок</Label>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 border-b py-1">
                    <span className="font-mono truncate">{h.token.slice(0, 12)}…</span>
                    <span className="text-muted-foreground">
                      {h.used_at
                        ? `использована ${new Date(h.used_at).toLocaleDateString("ru-RU")}`
                        : h.revoked_at
                          ? "отозвана"
                          : h.expires_at && new Date(h.expires_at).getTime() < Date.now()
                            ? "истекла"
                            : "активна"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

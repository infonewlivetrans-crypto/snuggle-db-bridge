import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGetAuth, apiPost } from "@/lib/api-client";

interface Invite {
  id: string;
  token: string;
  invite_url: string;
  expires_at: string | null;
  created_at: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteDriverDialog({ open, onOpenChange }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetAuth<{ rows: Invite[] }>("/api/carrier/driver-invites", 10000);
      setInvites(data.rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить приглашения");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const create = async () => {
    setCreating(true);
    try {
      const data = await apiPost<{ row: Invite }>("/api/carrier/driver-invites", {}, 15000);
      setInvites((prev) => [data.row, ...prev]);
      toast.success("Ссылка создана");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать ссылку");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ссылка водителю — пригласить в кабинет</DialogTitle>
          <DialogDescription>
            Создайте ссылку (/driver/register/…) и отправьте водителю любым удобным способом.
            По этой ссылке он зарегистрируется и автоматически попадёт в ваш список.
            Это <strong>ссылка водителю</strong> — не та же, что ссылка перевозчику.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button onClick={create} disabled={creating} className="w-full">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Создать новую ссылку
          </Button>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : invites.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Пока нет приглашений. Создайте первую ссылку.
            </div>
          ) : (
            <ul className="space-y-2">
              {invites.map((i) => {
                const expired =
                  i.expires_at != null && new Date(i.expires_at).getTime() < Date.now();
                return (
                  <li key={i.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Input value={i.invite_url} readOnly className="font-mono text-xs" />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copy(i.invite_url)}
                        title="Скопировать"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>Создана: {new Date(i.created_at).toLocaleString("ru-RU")}</span>
                      <span>
                        {expired
                          ? "Истекла"
                          : i.expires_at
                            ? `до ${new Date(i.expires_at).toLocaleDateString("ru-RU")}`
                            : "бессрочно"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

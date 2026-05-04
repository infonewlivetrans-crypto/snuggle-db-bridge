import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createInviteFn,
  deleteInviteFn,
  listInvitesFn,
  rotateInviteTokenFn,
  setInviteActiveFn,
  type InviteRole,
} from "@/lib/server-functions/invites.functions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatRuPhone } from "@/lib/phone";
import { toast } from "sonner";
import {
  Copy,
  Link2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/users/invites")({
  head: () => ({ meta: [{ title: "Инвайт-ссылки — Радиус Трек" }] }),
  component: InvitesPage,
});

function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function InvitesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["invites-admin"],
    queryFn: () => listInvitesFn(),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    fullName: string;
    phone: string;
    role: InviteRole;
    comment: string;
    managerName: string;
  }>({ fullName: "", phone: "", role: "driver", comment: "", managerName: "" });
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      createInviteFn({
        data: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          comment: form.comment.trim() || null,
          managerName: form.role === "manager" ? form.fullName.trim() : null,
        },
      }),
    onSuccess: (row) => {
      const link = inviteUrl(row.token);
      setCreatedLink(link);
      setForm({ fullName: "", phone: "", role: "driver", comment: "", managerName: "" });
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      toast.success("Инвайт создан");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось создать инвайт"),
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) => rotateInviteTokenFn({ data: { id } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      toast.success("Ссылка перевыпущена");
      void copyToClipboard(inviteUrl(row.token));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMut = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => setInviteActiveFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      toast.success("Статус ссылки обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteInviteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      toast.success("Инвайт удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Инвайт-ссылки
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ссылки для входа без email. Подходят для водителей и менеджеров.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/users" })}>
              <Users className="mr-2 h-4 w-4" />К пользователям
            </Button>
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setCreatedLink(null);
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Создать инвайт
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {createdLink ? "Ссылка создана" : "Новый инвайт"}
                  </DialogTitle>
                </DialogHeader>

                {createdLink ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Скопируйте ссылку и отправьте пользователю в личных сообщениях.
                      По этой ссылке он попадёт сразу в свой кабинет.
                    </p>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <code className="flex-1 break-all text-xs">{createdLink}</code>
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={async () => {
                        const ok = await copyToClipboard(createdLink);
                        toast.success(ok ? "Ссылка скопирована" : "Не удалось скопировать");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Скопировать ссылку
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Роль</Label>
                      <Select
                        value={form.role}
                        onValueChange={(v) =>
                          setForm({ ...form, role: v as InviteRole })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                          <SelectItem value="logist">{ROLE_LABELS.logist}</SelectItem>
                          <SelectItem value="manager">{ROLE_LABELS.manager}</SelectItem>
                          <SelectItem value="driver">{ROLE_LABELS.driver}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>ФИО</Label>
                      <Input
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                        placeholder="Иванов Иван Иванович"
                      />
                      {form.role === "manager" && (
                        <p className="text-xs text-muted-foreground">
                          Менеджер увидит заказы, у которых в карточке клиента указан этот менеджер.
                        </p>
                      )}
                      {form.role === "driver" && (
                        <p className="text-xs text-muted-foreground">
                          Водитель увидит маршруты, где ФИО или телефон совпадают с указанными.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Телефон</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+7 (999) 123-45-67"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Комментарий (необязательно)</Label>
                      <Textarea
                        rows={2}
                        value={form.comment}
                        onChange={(e) => setForm({ ...form, comment: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <DialogFooter>
                  {createdLink ? (
                    <Button
                      onClick={() => {
                        setOpen(false);
                        setCreatedLink(null);
                      }}
                    >
                      Готово
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setOpen(false)}>
                        Отмена
                      </Button>
                      <Button
                        onClick={() => createMut.mutate()}
                        disabled={createMut.isPending || !form.fullName.trim()}
                      >
                        {createMut.isPending ? "Создание…" : "Создать"}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead>ФИО</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Ссылка</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Последний вход</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    Инвайт-ссылок ещё нет
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const link = inviteUrl(r.token);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div>{r.full_name}</div>
                        {r.comment && (
                          <div className="text-xs text-muted-foreground">{r.comment}</div>
                        )}
                      </TableCell>
                      <TableCell>{ROLE_LABELS[r.role]}</TableCell>
                      <TableCell className="text-sm">
                        {r.phone ? formatRuPhone(r.phone) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="flex items-center gap-1.5">
                          <code className="truncate text-xs text-muted-foreground" title={link}>
                            {link}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={async () => {
                              const ok = await copyToClipboard(link);
                              toast.success(ok ? "Ссылка скопирована" : "Не удалось");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <span className="badge-status badge-status-completed">Активна</span>
                        ) : (
                          <span className="badge-status badge-status-cancelled">Отключена</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_used_at
                          ? new Date(r.last_used_at).toLocaleString("ru-RU")
                          : "не использовалась"}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => rotateMut.mutate(r.id)}
                          disabled={rotateMut.isPending}
                          title="Перевыпустить ссылку"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() =>
                            activeMut.mutate({ id: r.id, isActive: !r.is_active })
                          }
                          disabled={activeMut.isPending}
                        >
                          {r.is_active ? (
                            <ShieldOff className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive"
                          onClick={() => {
                            if (confirm(`Удалить инвайт «${r.full_name}»?`)) {
                              deleteMut.mutate(r.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/users"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← К пользователям с email
          </Link>
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import {
  createUserFn,
  listUsersFn,
  setUserActiveFn,
  setUserRolesFn,
} from "@/lib/server-functions/users.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, ShieldOff, ShieldCheck, Link2, UserCog, Settings2 } from "lucide-react";

export const Route = createFileRoute("/users/")({
  head: () => ({ meta: [{ title: "Пользователи — Радиус Трек" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const { data: rawData, isLoading } = useQuery({
    queryKey: ["users-admin"],
    queryFn: () => listUsersFn(),
  });
  const data = Array.isArray(rawData)
    ? rawData
    : (() => {
        if (rawData != null) console.error("listUsersFn: ожидался массив, получено:", rawData);
        return [];
      })();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; password: string; fullName: string; role: AppRole }>(
    { email: "", password: "", fullName: "", role: "manager" },
  );

  const createMut = useMutation({
    mutationFn: () => createUserFn({ data: form }),
    onSuccess: () => {
      toast.success("Пользователь создан");
      setOpen(false);
      setForm({ email: "", password: "", fullName: "", role: "manager" });
      qc.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMut = useMutation({
    mutationFn: (v: { userId: string; isActive: boolean }) => setUserActiveFn({ data: v }),
    onSuccess: () => {
      toast.success("Статус обновлён");
      qc.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [rolesEdit, setRolesEdit] = useState<{ userId: string; fullName: string; roles: AppRole[] } | null>(null);
  const rolesMut = useMutation({
    mutationFn: (v: { userId: string; roles: AppRole[] }) => setUserRolesFn({ data: v }),
    onSuccess: () => {
      toast.success("Роли обновлены");
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      setRolesEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleEditRole(role: AppRole) {
    setRolesEdit((prev) => {
      if (!prev) return prev;
      const has = prev.roles.includes(role);
      return { ...prev, roles: has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role] };
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Пользователи</h1>
            <p className="mt-1 text-sm text-muted-foreground">Управление учётными записями и ролями</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/users/managers">
              <Button variant="outline" className="gap-2">
                <UserCog className="h-4 w-4" />
                Менеджеры
              </Button>
            </Link>
            <Link to="/users/invites">
              <Button variant="outline" className="gap-2">
                <Link2 className="h-4 w-4" />
                Инвайт-ссылки
              </Button>
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Добавить пользователя
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Новый пользователь</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>ФИО</Label>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Пароль (минимум 6 символов)</Label>
                  <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Роль</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? "Создание…" : "Создать"}
                </Button>
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
                <TableHead>Email</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
              ) : (data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Пользователей нет</TableCell></TableRow>
              ) : (
                (data ?? []).map((u) => {
                  const userRoles = Array.isArray(u.roles) ? u.roles : [];
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {userRoles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">— нет ролей —</span>
                          ) : (
                            userRoles.map((r) => (
                              <span
                                key={r}
                                className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                              >
                                {ROLE_LABELS[r as AppRole] ?? r}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <span className="badge-status badge-status-completed">Активен</span>
                        ) : (
                          <span className="badge-status badge-status-cancelled">Заблокирован</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() =>
                              setRolesEdit({
                                userId: u.user_id,
                                fullName: u.full_name ?? u.email ?? "",
                                roles: [...userRoles] as AppRole[],
                              })
                            }
                          >
                            <Settings2 className="h-4 w-4" />
                            Роли
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => activeMut.mutate({ userId: u.user_id, isActive: !u.is_active })}
                          >
                            {u.is_active ? (<><ShieldOff className="h-4 w-4" />Заблокировать</>) : (<><ShieldCheck className="h-4 w-4" />Разблокировать</>)}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={rolesEdit !== null} onOpenChange={(o) => !o && setRolesEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Роли пользователя</DialogTitle>
          </DialogHeader>
          {rolesEdit && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{rolesEdit.fullName}</p>
              <div className="grid grid-cols-2 gap-2">
                {APP_ROLES.map((r) => {
                  const checked = rolesEdit.roles.includes(r);
                  return (
                    <label
                      key={r}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-secondary/50"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleEditRole(r)} />
                      <span>{ROLE_LABELS[r]}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Роль «Администратор» даёт доступ к разделу «Пользователи → Менеджеры» и всем настройкам.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRolesEdit(null)}>Отмена</Button>
            <Button
              onClick={() =>
                rolesEdit && rolesMut.mutate({ userId: rolesEdit.userId, roles: rolesEdit.roles })
              }
              disabled={rolesMut.isPending || !rolesEdit || rolesEdit.roles.length === 0}
            >
              {rolesMut.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

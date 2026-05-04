import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  createManagerFn,
  deleteManagerFn,
  importManagersFn,
  listManagersFn,
  updateManagerFn,
} from "@/lib/server-functions/managers.functions";
import {
  createInviteFn,
  listInvitesFn,
  rotateInviteTokenFn,
  setInviteActiveFn,
} from "@/lib/server-functions/invites.functions";
import { formatRuPhone } from "@/lib/phone";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Link2, Plus, RefreshCcw, ShieldCheck, ShieldOff, Trash2, Upload, Users } from "lucide-react";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const Route = createFileRoute("/users/managers")({
  head: () => ({ meta: [{ title: "Менеджеры — Радиус Трек" }] }),
  component: ManagersPage,
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

type ParsedRow = { fullName: string; phone?: string | null; comment?: string | null };

async function parseManagersExcel(file: File): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const rows: ParsedRow[] = [];
  for (const r of grid) {
    if (!Array.isArray(r)) continue;
    const fullName = String(r[0] ?? "").trim();
    if (!fullName) continue;
    // Пропускаем строки-заголовки
    if (/^(фио|менеджер|name|full[_ ]?name)$/i.test(fullName)) continue;
    rows.push({
      fullName,
      phone: r[1] != null && String(r[1]).trim() !== "" ? String(r[1]) : null,
      comment: r[2] != null && String(r[2]).trim() !== "" ? String(r[2]) : null,
    });
  }
  return rows;
}

function ManagersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const managersQuery = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      try {
        const res = await listManagersFn({ headers: await authHeaders() });
        return Array.isArray(res) ? res : [];
      } catch (e) {
        console.error("[managers] list failed", e);
        return [];
      }
    },
  });
  const invitesQuery = useQuery({
    queryKey: ["invites-admin"],
    queryFn: async () => {
      try {
        const res = await listInvitesFn({ headers: await authHeaders() });
        return Array.isArray(res) ? res : [];
      } catch (e) {
        console.error("[invites] list failed", e);
        return [];
      }
    },
  });

  const invitesByManagerName = useMemo(() => {
    const map = new Map<string, ReturnType<typeof Object> & { id: string; token: string; is_active: boolean }>();
    const list = Array.isArray(invitesQuery.data) ? invitesQuery.data : [];
    for (const inv of list as Array<{
      id: string;
      token: string;
      is_active: boolean;
      role: string;
      manager_name: string | null;
      full_name: string;
    }>) {
      if (inv.role !== "manager") continue;
      const key = (inv.manager_name ?? inv.full_name).toLowerCase().trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.set(key, inv as any);
    }
    return map;
  }, [invitesQuery.data]);

  const [importPreview, setImportPreview] = useState<ParsedRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", comment: "" });

  const importMut = useMutation({
    mutationFn: async (items: ParsedRow[]) =>
      importManagersFn({ data: { items }, headers: await authHeaders() }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      toast.success(`Импорт: добавлено ${res.inserted}, обновлено ${res.updated}, пропущено ${res.skipped}`);
      setImportPreview(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createManagerFn({
        data: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          comment: form.comment.trim() || null,
        },
        headers: await authHeaders(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Менеджер создан");
      setCreateOpen(false);
      setForm({ fullName: "", phone: "", comment: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async (v: { id: string; is_active: boolean }) =>
      updateManagerFn({ data: { id: v.id, patch: { is_active: v.is_active } }, headers: await authHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteManagerFn({ data: { id }, headers: await authHeaders() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Удалено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createInviteMut = useMutation({
    mutationFn: async (m: { fullName: string; phone: string | null }) =>
      createInviteFn({
        data: {
          fullName: m.fullName,
          phone: m.phone,
          role: "manager",
          managerName: m.fullName,
        },
        headers: await authHeaders(),
      }),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      void copyToClipboard(inviteUrl(inv.token)).then((ok) =>
        toast.success(ok ? "Ссылка скопирована" : "Ссылка создана"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: async (id: string) =>
      rotateInviteTokenFn({ data: { id }, headers: await authHeaders() }),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      void copyToClipboard(inviteUrl(inv.token)).then((ok) =>
        toast.success(ok ? "Ссылка перевыпущена и скопирована" : "Ссылка перевыпущена"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteActiveMut = useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) =>
      setInviteActiveFn({ data: v, headers: await authHeaders() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites-admin"] });
      toast.success("Готово");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onPickFile(file: File | null) {
    if (!file) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const rows = await parseManagersExcel(file);
      if (rows.length === 0) {
        setImportError("В файле не найдено строк с ФИО.");
        setImportPreview(null);
      } else {
        setImportPreview(rows);
      }
    } catch (e) {
      console.error(e);
      setImportError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const managers = Array.isArray(managersQuery.data) ? managersQuery.data : [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Менеджеры</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Справочник менеджеров. Используется для привязки заказов из маршрутного листа.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/users" })}>
              <Users className="mr-2 h-4 w-4" />
              К пользователям
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importBusy}>
              <Upload className="mr-2 h-4 w-4" />
              {importBusy ? "Чтение…" : "Импорт из Excel"}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить менеджера
            </Button>
          </div>
        </div>

        {importError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{importError}</AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead>ФИО</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Ссылка для входа</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managersQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : managers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    Менеджеров пока нет. Загрузите Excel или добавьте вручную.
                  </TableCell>
                </TableRow>
              ) : (
                managers.map((m) => {
                  const inv = invitesByManagerName.get(m.full_name.toLowerCase().trim());
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.full_name}</TableCell>
                      <TableCell className="text-sm">
                        {m.phone ? formatRuPhone(m.phone) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {m.comment ?? "—"}
                      </TableCell>
                      <TableCell>
                        {m.is_active ? (
                          <span className="badge-status badge-status-completed">Активен</span>
                        ) : (
                          <span className="badge-status badge-status-cancelled">Отключён</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {inv ? (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <code className="truncate text-xs" title={inviteUrl(inv.token)}>
                              {inviteUrl(inv.token)}
                            </code>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={async () => {
                                const ok = await copyToClipboard(inviteUrl(inv.token));
                                toast.success(ok ? "Скопировано" : "Не удалось");
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              createInviteMut.mutate({ fullName: m.full_name, phone: m.phone })
                            }
                            disabled={createInviteMut.isPending}
                          >
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                            Создать ссылку
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {inv && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Перевыпустить ссылку"
                              onClick={() => rotateMut.mutate(inv.id)}
                              disabled={rotateMut.isPending}
                            >
                              <RefreshCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title={inv.is_active ? "Отключить ссылку" : "Включить ссылку"}
                              onClick={() =>
                                inviteActiveMut.mutate({ id: inv.id, isActive: !inv.is_active })
                              }
                              disabled={inviteActiveMut.isPending}
                            >
                              {inv.is_active ? (
                                <ShieldOff className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          title={m.is_active ? "Отключить менеджера" : "Включить менеджера"}
                          onClick={() => toggleActiveMut.mutate({ id: m.id, is_active: !m.is_active })}
                        >
                          {m.is_active ? (
                            <ShieldOff className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Удалить «${m.full_name}»?`)) deleteMut.mutate(m.id);
                          }}
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
          <Link to="/users/invites" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Все инвайт-ссылки →
          </Link>
        </div>
      </main>

      {/* Создание */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новый менеджер</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ФИО</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Иванов И.И."
              />
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
              <Label>Комментарий</Label>
              <Input
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !form.fullName.trim()}
            >
              {createMut.isPending ? "Создание…" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Превью импорта */}
      <Dialog open={!!importPreview} onOpenChange={(v) => !v && setImportPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Предпросмотр импорта</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            Найдено строк: {importPreview?.length ?? 0}. Будут импортированы только уникальные ФИО.
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                  <TableHead>ФИО</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(importPreview ?? []).slice(0, 200).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{r.fullName}</TableCell>
                    <TableCell className="text-sm">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(importPreview?.length ?? 0) > 200 && (
              <div className="p-2 text-center text-xs text-muted-foreground">
                Показаны первые 200 строк, остальные тоже будут импортированы.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => importPreview && importMut.mutate(importPreview)}
              disabled={importMut.isPending || !importPreview?.length}
            >
              {importMut.isPending ? "Импорт…" : "Импортировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Админ-страница для приглашения новых пользователей-диспетчеров.
// Безопасный flow: создание приглашения через RPC, активация — на странице
// /dispatcher/invite/$token (штатный signUp + bind RPC, без service_role).

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api-client";
import { Copy, Plus, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users/dispatchers")({
  component: DispatchersAdminPage,
});

type InviteRow = {
  id: string;
  token: string;
  full_name: string;
  email: string | null;
  comment: string | null;
  is_active: boolean;
  activated_at: string | null;
  activated_user_id: string | null;
  created_at: string;
};

function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `/dispatcher/invite/${token}`;
  return `${window.location.origin}/dispatcher/invite/${token}`;
}

function DispatchersAdminPage() {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dispatcher-user-invites"],
    queryFn: () =>
      apiGet<{ rows: InviteRow[] }>("/api/admin/dispatcher-user-invites", { auth: true }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ row: InviteRow }>("/api/admin/dispatcher-user-invites", {
        full_name: fullName.trim(),
        email: email.trim() || null,
        comment: comment.trim() || null,
      }),
    onSuccess: ({ row }) => {
      toast.success("Приглашение создано");
      setFullName("");
      setEmail("");
      setComment("");
      qc.invalidateQueries({ queryKey: ["admin-dispatcher-user-invites"] });
      void navigator.clipboard?.writeText(inviteUrl(row.token)).catch(() => {});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiPost(`/api/admin/dispatcher-user-invites/${id}/revoke`, {}),
    onSuccess: () => {
      toast.success("Приглашение отключено");
      qc.invalidateQueries({ queryKey: ["admin-dispatcher-user-invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold">Диспетчеры — приглашения</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Создайте приглашение для нового диспетчера. Он сам задаст email и пароль на странице активации; роль <strong>dispatcher</strong> выдаётся автоматически.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="font-medium">Новое приглашение</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="full_name">ФИО *</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иванов Иван"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email (необязательно)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dispatcher@example.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="comment">Комментарий (необязательно)</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => create.mutate()}
              disabled={!fullName.trim() || create.isPending}
            >
              <Plus className="w-4 h-4 mr-1" />
              {create.isPending ? "Создаём…" : "Создать приглашение"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ФИО</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Ссылка</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Загружаем…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Приглашений ещё нет
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const url = inviteUrl(r.token);
                  const status = r.activated_at
                    ? "Активирована"
                    : r.is_active
                      ? "Ожидает"
                      : "Отключена";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell>{status}</TableCell>
                      <TableCell className="font-mono text-xs break-all max-w-[280px]">
                        {r.activated_at ? "—" : url}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {!r.activated_at && r.is_active && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                void navigator.clipboard?.writeText(url);
                                toast.success("Ссылка скопирована");
                              }}
                              title="Скопировать ссылку"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => revoke.mutate(r.id)}
                              disabled={revoke.isPending}
                              title="Отключить"
                            >
                              <ShieldOff className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

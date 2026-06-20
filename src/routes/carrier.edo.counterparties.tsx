// Справочник контрагентов ЭДО (Этап 1).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGetAuth, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";
import { Plus, Search, Archive } from "lucide-react";
import { EDO_PROVIDER_OPTIONS } from "@/lib/edo/constants";

export const Route = createFileRoute("/carrier/edo/counterparties")({
  head: () => ({ meta: [{ title: "Контрагенты ЭДО — Радиус Трек" }] }),
  component: CounterpartiesPage,
});

type VerStatus = "unknown" | "verified" | "not_found" | "error";

interface CpRow {
  id: string;
  name: string;
  company_name: string | null;
  inn: string | null;
  kpp: string | null;
  edo_operator: string | null;
  participant_id: string | null;
  email: string | null;
  phone: string | null;
  comment: string | null;
  verification_status: VerStatus;
  last_sync_at: string | null;
  archived_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<VerStatus, string> = {
  unknown: "Не проверен",
  verified: "Проверен",
  not_found: "Не найден",
  error: "Ошибка",
};

function statusVariant(s: VerStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (s) {
    case "verified": return "default";
    case "not_found": return "outline";
    case "error": return "destructive";
    default: return "secondary";
  }
}

interface FormState {
  company_name: string;
  inn: string;
  kpp: string;
  edo_operator: string;
  participant_id: string;
  email: string;
  phone: string;
  comment: string;
}

const EMPTY_FORM: FormState = {
  company_name: "", inn: "", kpp: "", edo_operator: "",
  participant_id: "", email: "", phone: "", comment: "",
};

function CounterpartiesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VerStatus>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CpRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const listKey = useMemo(
    () => ["edo", "counterparties", { search, status: statusFilter }],
    [search, statusFilter],
  );
  const q = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      return apiGetAuth<{ rows: CpRow[] }>(
        `/api/carrier/edo/counterparties${qs ? `?${qs}` : ""}`,
      );
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }
  function openEdit(row: CpRow) {
    setEditing(row);
    setForm({
      company_name: row.company_name ?? row.name ?? "",
      inn: row.inn ?? "",
      kpp: row.kpp ?? "",
      edo_operator: row.edo_operator ?? "",
      participant_id: row.participant_id ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      comment: row.comment ?? "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form };
      if (editing) return apiPatch(`/api/carrier/edo/counterparties/${editing.id}`, body);
      return apiPost(`/api/carrier/edo/counterparties`, body);
    },
    onSuccess: () => {
      toast.success("Сохранено");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["edo", "counterparties"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/carrier/edo/counterparties/${id}`),
    onSuccess: () => {
      toast.success("Контрагент архивирован");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["edo", "counterparties"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось архивировать"),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Контрагенты ЭДО</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />Добавить контрагента
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Список грузоотправителей, грузополучателей и других участников электронного
            документооборота. Используется при создании ЭТрН и других ЭДО-документов.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по ИНН или названию"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="verified">Проверенные</SelectItem>
                <SelectItem value="not_found">Не найдены</SelectItem>
                <SelectItem value="error">Ошибка</SelectItem>
                <SelectItem value="unknown">Не проверены</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Наименование</TableHead>
                  <TableHead>ИНН</TableHead>
                  <TableHead>КПП</TableHead>
                  <TableHead>Оператор ЭДО</TableHead>
                  <TableHead>Идентификатор</TableHead>
                  <TableHead>Статус проверки</TableHead>
                  <TableHead>Синхронизация</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Загрузка…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Контрагенты не найдены</TableCell></TableRow>
                ) : rows.map(r => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openEdit(r)}
                  >
                    <TableCell className="font-medium">{r.company_name ?? r.name}</TableCell>
                    <TableCell>{r.inn ?? "—"}</TableCell>
                    <TableCell>{r.kpp ?? "—"}</TableCell>
                    <TableCell>{r.edo_operator ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.participant_id ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.verification_status)}>
                        {STATUS_LABEL[r.verification_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_sync_at ? new Date(r.last_sync_at).toLocaleString("ru-RU") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Карточка контрагента" : "Новый контрагент"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Наименование *</Label>
              <Input value={form.company_name}
                onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div>
              <Label>ИНН</Label>
              <Input value={form.inn} onChange={(e) => setForm(f => ({ ...f, inn: e.target.value }))} />
            </div>
            <div>
              <Label>КПП</Label>
              <Input value={form.kpp} onChange={(e) => setForm(f => ({ ...f, kpp: e.target.value }))} />
            </div>
            <div>
              <Label>Оператор ЭДО</Label>
              <Select value={form.edo_operator || "_none"}
                onValueChange={(v) => setForm(f => ({ ...f, edo_operator: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Не указан</SelectItem>
                  {EDO_PROVIDER_OPTIONS.filter(o => o.value !== "internal_mock").map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Идентификатор участника</Label>
              <Input value={form.participant_id}
                onChange={(e) => setForm(f => ({ ...f, participant_id: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Комментарий</Label>
              <Textarea rows={2} value={form.comment}
                onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))} />
            </div>

            {editing && (
              <div className="sm:col-span-2 text-xs text-muted-foreground border-t pt-2">
                <div>
                  Статус проверки:{" "}
                  <Badge variant={statusVariant(editing.verification_status)}>
                    {STATUS_LABEL[editing.verification_status]}
                  </Badge>
                </div>
                <div className="mt-1">
                  Последняя синхронизация:{" "}
                  {editing.last_sync_at
                    ? new Date(editing.last_sync_at).toLocaleString("ru-RU")
                    : "не выполнялась"}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            {editing && (
              <Button
                variant="outline"
                onClick={() => archive.mutate(editing.id)}
                disabled={archive.isPending}
              >
                <Archive className="h-4 w-4 mr-1.5" />Архивировать
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.company_name.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

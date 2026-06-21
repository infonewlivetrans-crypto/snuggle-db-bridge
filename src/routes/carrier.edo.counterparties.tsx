// Справочник контрагентов ЭДО (Этап 1 + Этап 2: роли и mock-проверка по ИНН).
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
import { Plus, Search, Archive, ShieldCheck, Loader2 } from "lucide-react";
import {
  EDO_PROVIDER_OPTIONS,
  EDO_CP_ROLE_LABEL,
  EDO_CP_ROLE_OPTIONS,
  type EdoCounterpartyRole,
} from "@/lib/edo/constants";

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
  contact_person: string | null;
  address: string | null;
  role: EdoCounterpartyRole;
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
  error: "Ошибка проверки",
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
  contact_person: string;
  address: string;
  role: EdoCounterpartyRole;
  comment: string;
}

const EMPTY_FORM: FormState = {
  company_name: "", inn: "", kpp: "", edo_operator: "",
  participant_id: "", email: "", phone: "",
  contact_person: "", address: "", role: "both", comment: "",
};

function CounterpartiesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VerStatus>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | EdoCounterpartyRole>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CpRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const listKey = useMemo(
    () => ["edo", "counterparties", { search, status: statusFilter, role: roleFilter }],
    [search, statusFilter, roleFilter],
  );
  const q = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);
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
      contact_person: row.contact_person ?? "",
      address: row.address ?? "",
      role: row.role ?? "both",
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

  const verify = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ result: { ok: boolean; status: VerStatus; message?: string } }>(
        `/api/carrier/edo/counterparties/${id}/verify`,
      ),
    onSuccess: (data) => {
      const r = data.result;
      if (r.status === "verified") toast.success(r.message ?? "Контрагент проверен");
      else if (r.status === "not_found") toast.warning(r.message ?? "Контрагент не найден");
      else toast.error(r.message ?? "Не удалось проверить");
      qc.invalidateQueries({ queryKey: ["edo", "counterparties"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка проверки"),
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
            Грузоотправители, грузополучатели и другие участники электронного
            документооборота. Используется при создании ЭТрН.
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
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все роли</SelectItem>
                <SelectItem value="shipper">Грузоотправители</SelectItem>
                <SelectItem value="consignee">Грузополучатели</SelectItem>
                <SelectItem value="both">Универсальные</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
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
                  <TableHead>Роль</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Телефон / Email</TableHead>
                  <TableHead>Оператор ЭДО</TableHead>
                  <TableHead>Проверка</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Загрузка…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Контрагенты не найдены</TableCell></TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell
                      className="font-medium cursor-pointer"
                      onClick={() => openEdit(r)}
                    >
                      {r.company_name ?? r.name}
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={() => openEdit(r)}>
                      {r.inn ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{EDO_CP_ROLE_LABEL[r.role ?? "both"]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.contact_person ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div>{r.phone ?? "—"}</div>
                      <div className="text-muted-foreground">{r.email ?? ""}</div>
                    </TableCell>
                    <TableCell>{r.edo_operator ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.verification_status)}>
                        {STATUS_LABEL[r.verification_status]}
                      </Badge>
                      {r.last_sync_at && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(r.last_sync_at).toLocaleString("ru-RU")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={verify.isPending && verify.variables === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          verify.mutate(r.id);
                        }}
                      >
                        {verify.isPending && verify.variables === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                        )}
                        ИНН
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <div className="sm:col-span-2">
              <Label>Роль *</Label>
              <Select value={form.role}
                onValueChange={(v) => setForm(f => ({ ...f, role: v as EdoCounterpartyRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EDO_CP_ROLE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="sm:col-span-2">
              <Label>Контактное лицо</Label>
              <Input value={form.contact_person}
                onChange={(e) => setForm(f => ({ ...f, contact_person: e.target.value }))} />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Адрес</Label>
              <Input value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Комментарий</Label>
              <Textarea rows={2} value={form.comment}
                onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))} />
            </div>

            {editing && (
              <div className="sm:col-span-2 border-t pt-2 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Статус: </span>
                    <Badge variant={statusVariant(editing.verification_status)}>
                      {STATUS_LABEL[editing.verification_status]}
                    </Badge>
                    {editing.last_sync_at && (
                      <span className="ml-2 text-muted-foreground">
                        {new Date(editing.last_sync_at).toLocaleString("ru-RU")}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => verify.mutate(editing.id)}
                    disabled={verify.isPending}
                  >
                    {verify.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      : <ShieldCheck className="h-4 w-4 mr-1" />}
                    Проверить по ИНН
                  </Button>
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

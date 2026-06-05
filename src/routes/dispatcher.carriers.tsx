import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Archive, Eye } from "lucide-react";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { ContactLinks } from "@/components/dispatcher/ContactLinks";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { CarrierForm } from "@/components/dispatcher/CarrierForm";
import { InviteLinkButton } from "@/components/dispatcher/InviteLinkButton";
import { carriersApi } from "@/lib/dispatcher/api";
import type { CarrierDTO } from "@/lib/dispatcher/types";
import type { CarrierCreateInput } from "@/lib/dispatcher/schemas";
import {
  CARRIER_KIND_LABELS,
  CARRIER_STATUSES,
  CARRIER_STATUS_LABELS,
  type CarrierKind,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/dispatcher/carriers")({
  component: CarriersPage,
});

function CarriersPage() {
  const [rows, setRows] = useState<CarrierDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [city, setCity] = useState("");
  const [editing, setEditing] = useState<CarrierDTO | null>(null);
  const [viewing, setViewing] = useState<CarrierDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await carriersApi.list({ search, status, city, limit: 200 });
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, city]);

  const handleSubmit = async (data: CarrierCreateInput) => {
    setSubmitting(true);
    try {
      if (editing) {
        await carriersApi.update(editing.id, data);
        toast.success("Перевозчик обновлён");
      } else {
        await carriersApi.create(data);
        toast.success("Перевозчик добавлен");
      }
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Архивировать перевозчика?")) return;
    try {
      await carriersApi.archive(id);
      toast.success("Архивирован");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleStatusChange = async (row: CarrierDTO, newStatus: string) => {
    try {
      await carriersApi.update(row.id, { verification_status: newStatus as CarrierCreateInput["verification_status"] });
      toast.success("Статус обновлён");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const filtered = useMemo(() => rows, [rows]);

  return (
    <EntityTableLayout
      title="Перевозчики (AI-диспетчер)"
      onCreate={() => { setEditing(null); setDialogOpen(true); }}
      toolbar={
        <>
          <Input
            placeholder="Поиск: название, телефон, email, ИНН"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
          <Input
            placeholder="Город"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-48"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {CARRIER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{CARRIER_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Город</TableHead>
              <TableHead>ИНН</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                <TableCell>{r.carrier_kind ? CARRIER_KIND_LABELS[r.carrier_kind as CarrierKind] ?? r.carrier_kind : "—"}</TableCell>
                <TableCell>{r.city ?? "—"}</TableCell>
                <TableCell>{r.inn ?? "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ContactLinks phone={r.phone} whatsapp={r.whatsapp} telegram={r.telegram} max_messenger={r.max_messenger} email={r.email} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.verification_status} onValueChange={(v) => handleStatusChange(r, v)}>
                    <SelectTrigger className="h-7 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CARRIER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{CARRIER_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => setViewing(r)} title="Просмотр">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }} title="Редактировать">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleArchive(r.id)} title="Архивировать">
                    <Archive className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать перевозчика" : "Новый перевозчик"}</DialogTitle>
            <DialogDescription>Заполните данные перевозчика и сохраните.</DialogDescription>
          </DialogHeader>
          <CarrierForm
            initial={editing}
            submitting={submitting}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name ?? "Перевозчик"}</DialogTitle>
            <DialogDescription>Карточка перевозчика.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <Row label="Тип" value={viewing.carrier_kind ? CARRIER_KIND_LABELS[viewing.carrier_kind as CarrierKind] ?? viewing.carrier_kind : "—"} />
              <Row label="ИНН" value={viewing.inn ?? "—"} />
              <Row label="ОГРН" value={viewing.ogrn ?? "—"} />
              <Row label="Город" value={viewing.city ?? "—"} />
              <Row label="Телефон" value={viewing.phone ?? "—"} />
              <Row label="Email" value={viewing.email ?? "—"} />
              <Row label="WhatsApp" value={viewing.whatsapp ?? "—"} />
              <Row label="Telegram" value={viewing.telegram ?? "—"} />
              <Row label="Max" value={viewing.max_messenger ?? "—"} />
              <Row label="Банк" value={viewing.bank_name ?? "—"} />
              <Row label="Р/счёт" value={viewing.bank_account ?? "—"} />
              <Row label="БИК" value={viewing.bank_bik ?? "—"} />
              <Row label="Комиссия" value={`${(viewing.commission_rate * 100).toFixed(1)}%`} />
              <Row label="Статус" value={<StatusBadge status={viewing.verification_status} label={CARRIER_STATUS_LABELS[viewing.verification_status as keyof typeof CARRIER_STATUS_LABELS] ?? viewing.verification_status} />} />
              <Row label="Комментарий" value={viewing.dispatcher_comment ?? "—"} />
              <div className="pt-3 flex gap-2">
                <ContactLinks phone={viewing.phone} whatsapp={viewing.whatsapp} telegram={viewing.telegram} max_messenger={viewing.max_messenger} email={viewing.email} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </EntityTableLayout>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-32 text-muted-foreground">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}

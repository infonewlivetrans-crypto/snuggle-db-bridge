import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Pencil, Archive, Eye, RotateCcw } from "lucide-react";
import { InviteLinkButton } from "@/components/dispatcher/InviteLinkButton";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { ContactLinks } from "@/components/dispatcher/ContactLinks";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { DriverForm } from "@/components/dispatcher/DriverForm";
import { DispatcherDocumentsBlock } from "@/components/dispatcher/DispatcherDocumentsBlock";
import { DispatcherPartnerCardBlock } from "@/components/dispatcher/DispatcherPartnerCardBlock";
import { driversApi, carriersApi } from "@/lib/dispatcher/api";
import type { CarrierDTO, DriverDTO } from "@/lib/dispatcher/types";
import type { DriverCreateInput } from "@/lib/dispatcher/schemas";
import {
  DRIVER_STATUSES,
  DRIVER_STATUS_LABELS,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/dispatcher/drivers")({
  component: DriversPage,
});

function DriversPage() {
  const [rows, setRows] = useState<DriverDTO[]>([]);
  const [carriers, setCarriers] = useState<CarrierDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [city, setCity] = useState("");
  const [carrierFilter, setCarrierFilter] = useState<string>("all");
  const [archived, setArchived] = useState<"hide" | "only" | "all">("hide");
  const [editing, setEditing] = useState<DriverDTO | null>(null);
  const [viewing, setViewing] = useState<DriverDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await driversApi.list({
        search,
        status,
        city,
        carrier_id: carrierFilter === "all" ? "" : carrierFilter,
        archived,
        limit: 200,
      });
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const loadCarriers = async () => {
    try {
      const res = await carriersApi.list({ limit: 500 });
      setCarriers(res.rows);
    } catch {
      // silent
    }
  };

  useEffect(() => { loadCarriers(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, city, carrierFilter, archived]);

  const handleSubmit = async (data: DriverCreateInput) => {
    setSubmitting(true);
    try {
      if (editing) await driversApi.update(editing.id, data);
      else await driversApi.create(data);
      toast.success(editing ? "Водитель обновлён" : "Водитель добавлен");
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Архивировать водителя?")) return;
    try {
      await driversApi.archive(id);
      toast.success("Архивирован");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm("Восстановить водителя из архива?")) return;
    try {
      await driversApi.update(id, { dispatcher_status: "new" } as never);
      toast.success("Восстановлен");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleStatusChange = async (row: DriverDTO, v: string) => {
    try {
      await driversApi.update(row.id, { dispatcher_status: v as DriverCreateInput["dispatcher_status"] });
      toast.success("Статус обновлён");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const carrierName = (id: string | null) =>
    id ? carriers.find((c) => c.id === id)?.name ?? "—" : "—";

  return (
    <EntityTableLayout
      title="Водители (AI-диспетчер)"
      onCreate={() => { setEditing(null); setDialogOpen(true); }}
      toolbar={
        <>
          <Input placeholder="Поиск: ФИО, телефон, email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
          <Input placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} className="w-40" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {DRIVER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{DRIVER_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={carrierFilter} onValueChange={setCarrierFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Перевозчик" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все перевозчики</SelectItem>
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name ?? c.id}</SelectItem>
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
              <TableHead>ФИО</TableHead>
              <TableHead>Перевозчик</TableHead>
              <TableHead>Город</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                <TableCell>{carrierName(r.dispatcher_carrier_ext_id)}</TableCell>
                <TableCell>{r.city ?? "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ContactLinks phone={r.phone} whatsapp={r.whatsapp} telegram={r.telegram} max_messenger={r.max_messenger} email={r.email} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.dispatcher_status} onValueChange={(v) => handleStatusChange(r, v)}>
                    <SelectTrigger className="h-7 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DRIVER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{DRIVER_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <InviteLinkButton entityType="driver" entityId={r.id} inviteType="driver_registration" />
                  <Button size="icon" variant="ghost" onClick={() => handleArchive(r.id)}><Archive className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать водителя" : "Новый водитель"}</DialogTitle>
            <DialogDescription>Заполните данные водителя и сохраните.</DialogDescription>
          </DialogHeader>
          <DriverForm
            initial={editing}
            carriers={carriers}
            initialCarrierId={carrierFilter !== "all" ? carrierFilter : null}
            submitting={submitting}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.full_name ?? "Водитель"}</DialogTitle>
            <DialogDescription>Карточка водителя.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <Row label="Перевозчик" value={carrierName(viewing.dispatcher_carrier_ext_id)} />
              <Row label="Город" value={viewing.city ?? "—"} />
              <Row label="Телефон" value={viewing.phone ?? "—"} />
              <Row label="Email" value={viewing.email ?? "—"} />
              <Row label="Telegram" value={viewing.telegram ?? "—"} />
              <Row label="WhatsApp" value={viewing.whatsapp ?? "—"} />
              <Row label="Max" value={viewing.max_messenger ?? "—"} />
              <Row label="Статус" value={<StatusBadge status={viewing.dispatcher_status} label={DRIVER_STATUS_LABELS[viewing.dispatcher_status as keyof typeof DRIVER_STATUS_LABELS] ?? viewing.dispatcher_status} />} />
              <Row label="Комментарий" value={viewing.dispatcher_comment ?? "—"} />
              <div className="pt-3"><ContactLinks phone={viewing.phone} whatsapp={viewing.whatsapp} telegram={viewing.telegram} max_messenger={viewing.max_messenger} email={viewing.email} /></div>
              <DispatcherDocumentsBlock ownerType="driver" ownerId={viewing.id} />
              {viewing.dispatcher_carrier_ext_id && (
                <DispatcherPartnerCardBlock
                  carrierExtId={viewing.dispatcher_carrier_ext_id}
                  initialDriverId={viewing.id}
                />
              )}
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

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
import { Pencil, Archive, Eye, Truck } from "lucide-react";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { ContactLinks } from "@/components/dispatcher/ContactLinks";
import { FreightForm } from "@/components/dispatcher/FreightForm";
import { CityCombobox } from "@/components/common/CityCombobox";
import { FreightMatchResults } from "@/components/dispatcher/FreightMatchResults";
import { FreightPipelinePanel } from "@/components/dispatcher/FreightPipelinePanel";
import { FreightFromEmailBlock } from "@/components/dispatcher/FreightFromEmailBlock";
import { freightsApi } from "@/lib/dispatcher/api";
import type { FreightDTO, MatchResult } from "@/lib/dispatcher/types";
import type { FreightCreateInput } from "@/lib/dispatcher/schemas";
import {
  FREIGHT_KINDS, FREIGHT_KIND_LABELS,
  FREIGHT_STATUSES, FREIGHT_STATUS_LABELS,
  LOAD_METHOD_LABELS, PAYMENT_TYPE_LABELS,
  type FreightStatus, type LoadMethod, type PaymentType,
} from "@/lib/dispatcher/statuses";
import { VEHICLE_BODY_TYPES, getVehicleBodyTypeLabel } from "@/lib/dispatcher/vehicle-options";

export const Route = createFileRoute("/dispatcher/freights")({
  component: FreightsPage,
});

function FreightsPage() {
  const [rows, setRows] = useState<FreightDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [loadingCity, setLoadingCity] = useState("");
  const [unloadingCity, setUnloadingCity] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [view, setView] = useState<string>("all");
  const [editing, setEditing] = useState<FreightDTO | null>(null);
  const [viewing, setViewing] = useState<FreightDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [matching, setMatching] = useState<FreightDTO | null>(null);
  const [matchRows, setMatchRows] = useState<MatchResult[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await freightsApi.list({
        search, status, loading_city: loadingCity, unloading_city: unloadingCity,
        body_type: bodyType, loading_date_from: dateFrom, freight_kind: kind,
        view,
        limit: 200,
      });
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, loadingCity, unloadingCity, bodyType, dateFrom, kind, view]);

  const handleSubmit = async (data: FreightCreateInput) => {
    setSubmitting(true);
    try {
      let updatedRow: FreightDTO | null = null;
      if (editing) {
        const res = await freightsApi.update(editing.id, data);
        updatedRow = res.row;
      } else {
        const res = await freightsApi.create(data);
        updatedRow = res.row;
      }
      toast.success(editing ? "Груз обновлён" : "Груз добавлен");
      setDialogOpen(false);
      setEditing(null);
      if (updatedRow) {
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === updatedRow!.id);
          if (idx === -1) return [updatedRow!, ...prev];
          const next = prev.slice();
          next[idx] = updatedRow!;
          return next;
        });
        setViewing((v) => (v && v.id === updatedRow!.id ? updatedRow! : v));
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally { setSubmitting(false); }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Архивировать груз?")) return;
    try {
      await freightsApi.archive(id);
      toast.success("Архивирован");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleStatusChange = async (row: FreightDTO, v: string) => {
    try {
      await freightsApi.update(row.id, { dispatcher_status: v as FreightStatus });
      toast.success("Статус обновлён");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleMatch = async (row: FreightDTO) => {
    setMatching(row);
    setMatchLoading(true);
    setMatchRows([]);
    try {
      const res = await freightsApi.matchVehicles(row.id);
      setMatchRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка подбора");
    } finally { setMatchLoading(false); }
  };

  const fmtMoney = (n: number | null) => n == null ? "—" : `${n.toLocaleString("ru-RU")} ₽`;

  return (
    <EntityTableLayout
      title="Найденные грузы"
      createLabel="Добавить груз"
      onCreate={() => { setEditing(null); setDialogOpen(true); }}
      toolbar={
        <>
          <Input placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <div className="w-44"><CityCombobox value={loadingCity} onChange={setLoadingCity} placeholder="Город загрузки" size="sm" /></div>
          <div className="w-44"><CityCombobox value={unloadingCity} onChange={setUnloadingCity} placeholder="Город выгрузки" size="sm" /></div>
          <Select value={bodyType || "all"} onValueChange={(v) => setBodyType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Тип кузова" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы кузова</SelectItem>
              {VEHICLE_BODY_TYPES.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {FREIGHT_STATUSES.map((s) => <SelectItem key={s} value={s}>{FREIGHT_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Тип" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              {FREIGHT_KINDS.map((k) => <SelectItem key={k} value={k}>{FREIGHT_KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Раздел" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все грузы</SelectItem>
              <SelectItem value="email">Из почты</SelectItem>
              <SelectItem value="needs_review">Нужна проверка</SelectItem>
              <SelectItem value="parsed">Разобрано</SelectItem>
              <SelectItem value="handed_over">Передано перевозчику</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <FreightFromEmailBlock onCreated={load} />
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Откуда → Куда</TableHead>
              <TableHead>Дата загр.</TableHead>
              <TableHead>Груз</TableHead>
              <TableHead>Вес / Объём</TableHead>
              <TableHead>Кузов</TableHead>
              <TableHead>Ставка</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                <TableCell className="font-medium">
                  <div>{r.loading_city ?? "—"} → {r.unloading_city ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.title ?? ""}</div>
                </TableCell>
                <TableCell className="text-xs">{r.loading_date ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.cargo_name ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  <div>{r.weight_kg != null ? `${r.weight_kg} кг` : "—"}</div>
                  <div className="text-muted-foreground">{r.volume_m3 != null ? `${r.volume_m3} м³` : ""}</div>
                </TableCell>
                <TableCell className="text-xs">{r.body_type ? getVehicleBodyTypeLabel(r.body_type) : "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{fmtMoney(r.rate)}</TableCell>
                <TableCell className="text-xs">
                  {r.source_url ? (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="underline hover:text-foreground">{r.source ?? "ссылка"}</a>
                  ) : (r.source ?? "—")}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.dispatcher_status} onValueChange={(v) => handleStatusChange(r, v)}>
                    <SelectTrigger className="h-7 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREIGHT_STATUSES.map((s) => <SelectItem key={s} value={s}>{FREIGHT_STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" title="Подобрать машины" onClick={() => handleMatch(r)}><Truck className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Просмотр" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Редактировать" onClick={() => { setEditing(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Архив" onClick={() => handleArchive(r.id)}><Archive className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Форма */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать груз" : "Новый груз"}</DialogTitle>
            <DialogDescription>Заполните данные груза и сохраните.</DialogDescription>
          </DialogHeader>
          <FreightForm initial={editing} submitting={submitting}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            onSubmit={handleSubmit} />
        </DialogContent>
      </Dialog>

      {/* Карточка просмотра */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Груз</DialogTitle>
            <DialogDescription>Карточка груза.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <Row label="Название" value={viewing.title ?? "—"} />
              <Row label="Маршрут" value={`${viewing.loading_city ?? "—"} → ${viewing.unloading_city ?? "—"}`} />
              <Row label="Даты" value={`${viewing.loading_date ?? "—"} / ${viewing.unloading_date ?? "—"}`} />
              <Row label="Груз" value={viewing.cargo_name ?? "—"} />
              <Row label="Вес" value={viewing.weight_kg != null ? `${viewing.weight_kg} кг` : "—"} />
              <Row label="Объём" value={viewing.volume_m3 != null ? `${viewing.volume_m3} м³` : "—"} />
              <Row label="Кузов" value={viewing.body_type ? getVehicleBodyTypeLabel(viewing.body_type) : "—"} />
              <Row label="Способы загрузки" value={(viewing.load_methods ?? []).map((m) => LOAD_METHOD_LABELS[m as LoadMethod] ?? m).join(", ") || "—"} />
              <Row label="Ставка" value={fmtMoney(viewing.rate)} />
              <Row label="Оплата" value={viewing.payment_type ? (PAYMENT_TYPE_LABELS[viewing.payment_type as PaymentType] ?? viewing.payment_type) : "—"} />
              <Row label="Отсрочка" value={viewing.payment_delay_days != null ? `${viewing.payment_delay_days} дн.` : "—"} />
              <Row label="Источник" value={viewing.source_url
                ? <a href={viewing.source_url} target="_blank" rel="noopener noreferrer" className="underline">{viewing.source ?? viewing.source_url}</a>
                : (viewing.source ?? "—")} />
              {(viewing.source_type === "email" || viewing.source_type === "manual_email") && (
                <>
                  <Row label="От кого" value={viewing.source_email_from ?? "—"} />
                  <Row label="Тема письма" value={viewing.source_email_subject ?? "—"} />
                  <Row label="Дата письма" value={viewing.source_received_at ? new Date(viewing.source_received_at).toLocaleString("ru-RU") : "—"} />
                  <Row label="Вложений" value={String(viewing.source_document_count ?? 0)} />
                  <Row label="Статус разбора" value={viewing.parse_status ?? "—"} />
                </>
              )}
              <Row label="Контакт" value={viewing.contact_name ?? "—"} />
              <Row label="Каналы" value={
                <ContactLinks
                  phone={viewing.contact_phone}
                  whatsapp={viewing.contact_whatsapp}
                  telegram={viewing.contact_telegram}
                  max_messenger={viewing.contact_max_messenger}
                />
              } />
              <Row label="Тип" value={FREIGHT_KIND_LABELS[viewing.freight_kind as keyof typeof FREIGHT_KIND_LABELS] ?? viewing.freight_kind} />
              <Row label="Статус" value={<StatusBadge status={viewing.dispatcher_status} label={FREIGHT_STATUS_LABELS[viewing.dispatcher_status as FreightStatus] ?? viewing.dispatcher_status} />} />
              <Row label="Комментарий" value={viewing.comment ?? "—"} />
              <FreightPipelinePanel freight={viewing} onChanged={(r) => { setViewing(r); setRows((prev) => prev.map((x) => x.id === r.id ? r : x)); }} />
              <div className="pt-3">
                <Button onClick={() => { setViewing(null); handleMatch(viewing); }}>
                  <Truck className="h-4 w-4 mr-1" /> Проверить машины
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Результаты подбора */}
      <Dialog open={!!matching} onOpenChange={(o) => { if (!o) { setMatching(null); setMatchRows([]); } }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Подбор машин — {matching ? `${matching.loading_city ?? "—"} → ${matching.unloading_city ?? "—"}` : ""}
            </DialogTitle>
            <DialogDescription>Результаты подбора подходящих транспортных средств.</DialogDescription>
          </DialogHeader>
          <FreightMatchResults rows={matchRows} loading={matchLoading} freightId={matching?.id ?? null} />
        </DialogContent>
      </Dialog>
    </EntityTableLayout>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-44 text-muted-foreground">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}

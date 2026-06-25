import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Archive, Eye, CheckCircle2, AlertTriangle, ShieldCheck, ShieldOff, RotateCcw, Truck, Users, Route as RouteIcon } from "lucide-react";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { ContactLinks } from "@/components/dispatcher/ContactLinks";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { CarrierForm } from "@/components/dispatcher/CarrierForm";
import { CarrierRegistrationBlock } from "@/components/dispatcher/CarrierRegistrationBlock";
import { CarrierUserLinkBlock } from "@/components/dispatcher/CarrierUserLinkBlock";
import { DispatcherDocumentsBlock } from "@/components/dispatcher/DispatcherDocumentsBlock";
import { DispatcherCarrierRequestsBlock } from "@/components/dispatcher/DispatcherCarrierRequestsBlock";
import { CityCombobox } from "@/components/common/CityCombobox";
import { CarrierContractAcceptanceBlock } from "@/components/dispatcher/CarrierContractAcceptanceBlock";
import { DispatcherCarrierEpdReadinessSummary } from "@/components/edo/DispatcherCarrierEpdReadinessSummary";
import { carriersApi, driversApi, vehiclesApi } from "@/lib/dispatcher/api";
import type { CarrierDTO, DriverDTO, VehicleDTO } from "@/lib/dispatcher/types";
import type { CarrierCreateInput } from "@/lib/dispatcher/schemas";
import {
  CARRIER_KIND_LABELS,
  CARRIER_STATUSES,
  CARRIER_STATUS_LABELS,
  CARRIER_TAX_REGIME_LABELS,
  DRIVER_STATUS_LABELS,
  VEHICLE_STATUS_LABELS,
  type CarrierKind,
  type CarrierTaxRegime,
  type DriverStatus,
  type VehicleStatus,
} from "@/lib/dispatcher/statuses";


export const Route = createFileRoute("/dispatcher/carriers")({
  component: CarriersPage,
});

// Быстрый фильтр-пресет в дополнение к выбору статуса.
type QuickFilter = "all" | "ready_to_work" | "on_check" | "missing_docs" | "no_consent" | "form_submitted";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "ready_to_work", label: "Готовые к работе" },
  { value: "on_check", label: "На проверке" },
  { value: "missing_docs", label: "Не хватает документов" },
  { value: "no_consent", label: "Без согласия на 5%" },
  { value: "form_submitted", label: "Анкета получена" },
];

function CarriersPage() {
  const [rows, setRows] = useState<CarrierDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [archived, setArchived] = useState<"hide" | "only" | "all">("hide");
  const [city, setCity] = useState("");
  const [editing, setEditing] = useState<CarrierDTO | null>(null);
  const [viewing, setViewing] = useState<CarrierDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await carriersApi.list({ search, status, city, archived, limit: 200 });
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
  }, [search, status, city, archived]);

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

  const handleRestore = async (id: string) => {
    if (!confirm("Восстановить перевозчика из архива?")) return;
    try {
      await carriersApi.update(id, { verification_status: "on_check" } as never);
      toast.success("Восстановлен");
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

  // Быстрая смена статуса проверки из карточки.
  const setVerification = async (
    row: CarrierDTO,
    newStatus: "ready_to_work" | "on_check" | "missing_docs" | "blocked",
    docsComment?: string,
  ) => {
    try {
      const patch: CarrierCreateInput = { verification_status: newStatus } as never;
      if (docsComment !== undefined) {
        (patch as Record<string, unknown>).dispatcher_comment = docsComment || null;
      }
      const res = await carriersApi.update(row.id, patch);
      toast.success("Статус обновлён");
      setViewing(res.row);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const filtered = useMemo(() => {
    if (quick === "all") return rows;
    if (quick === "no_consent") return rows.filter((r) => !r.commission_agreed);
    if (quick === "form_submitted") return rows.filter((r) => !!r.commission_agreed_at);
    return rows.filter((r) => r.verification_status === quick);
  }, [rows, quick]);

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
          <div className="w-48">
            <CityCombobox value={city} onChange={setCity} placeholder="Город" size="sm" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {CARRIER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{CARRIER_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={quick} onValueChange={(v) => setQuick(v as QuickFilter)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Быстрый фильтр" /></SelectTrigger>
            <SelectContent>
              {QUICK_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={archived} onValueChange={(v) => setArchived(v as "hide" | "only" | "all")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hide">Активные</SelectItem>
              <SelectItem value="only">Архив</SelectItem>
              <SelectItem value="all">Все</SelectItem>
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
              <TableHead>Признаки</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>
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
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.commission_agreed ? (
                      <Badge variant="default" className="text-xs">5% ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Нет согласия</Badge>
                    )}
                    {r.commission_agreed_at && (
                      <Badge variant="secondary" className="text-xs">Анкета</Badge>
                    )}
                    {r.verification_status === "missing_docs" && (
                      <Badge variant="destructive" className="text-xs">Нет документов</Badge>
                    )}
                  </div>
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
                  {r.verification_status === "archive" ? (
                    <Button size="icon" variant="ghost" onClick={() => handleRestore(r.id)} title="Восстановить">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" onClick={() => handleArchive(r.id)} title="Архивировать">
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.name ?? "Перевозчик"}</DialogTitle>
            <DialogDescription>Карточка перевозчика.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <CarrierViewBody
              row={viewing}
              onVerify={(s, comment) => setVerification(viewing, s, comment)}
            />
          )}
        </DialogContent>
      </Dialog>
    </EntityTableLayout>
  );
}

function CarrierViewBody({
  row,
  onVerify,
}: {
  row: CarrierDTO;
  onVerify: (
    s: "ready_to_work" | "on_check" | "missing_docs" | "blocked",
    docsComment?: string,
  ) => void;
}) {
  const [docsComment, setDocsComment] = useState(row.dispatcher_comment ?? "");
  const [showDocsField, setShowDocsField] = useState(row.verification_status === "missing_docs");
  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, v] = await Promise.all([
          driversApi.list({ carrier_id: row.id, archived: "hide", limit: 200 }),
          vehiclesApi.list({ carrier_id: row.id, archived: "hide", limit: 200 }),
        ]);
        if (cancelled) return;
        setDrivers(d.rows);
        setVehicles(v.rows);
      } catch {
        /* мягко игнорируем — карточка не должна падать из-за подсчётов */
      }
    })();
    return () => { cancelled = true; };
  }, [row.id]);

  const inTrip = useMemo(
    () => vehicles.filter((v) => v.dispatcher_status === "in_trip").length,
    [vehicles],
  );

  const kindLabel = row.carrier_kind
    ? CARRIER_KIND_LABELS[row.carrier_kind as CarrierKind] ?? row.carrier_kind
    : "—";
  const taxLabel = row.tax_regime
    ? CARRIER_TAX_REGIME_LABELS[row.tax_regime as CarrierTaxRegime] ?? row.tax_regime
    : "—";

  return (
    <div className="space-y-4 text-sm">
      {/* 1. Шапка */}
      <div className="rounded-md border p-3 space-y-2 bg-muted/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-lg font-semibold">{row.name ?? "Без названия"}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{kindLabel}</Badge>
              {row.city && <span>· {row.city}</span>}
              {row.inn && <span>· ИНН {row.inn}</span>}
            </div>
          </div>
          <StatusBadge
            status={row.verification_status}
            label={CARRIER_STATUS_LABELS[row.verification_status as keyof typeof CARRIER_STATUS_LABELS] ?? row.verification_status}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Комиссия" value={`${(row.commission_rate * 100).toFixed(1)}%`} />
          <Stat icon={<Truck className="h-4 w-4" />} label="Транспорт" value={String(vehicles.length)} />
          <Stat icon={<Users className="h-4 w-4" />} label="Водители" value={String(drivers.length)} />
          <Stat icon={<RouteIcon className="h-4 w-4" />} label="В рейсе" value={String(inTrip)} />
        </div>
      </div>

      {/* 2. Контакты */}
      <Section title="Контакты">
        <Row label="Телефон" value={row.phone ?? "—"} />
        <Row label="Email" value={row.email ?? "—"} />
        <Row label="WhatsApp" value={row.whatsapp ?? "—"} />
        <Row label="Telegram" value={row.telegram ?? "—"} />
        <Row label="Max Messenger" value={row.max_messenger ?? "—"} />
        <Row label="ATI ID" value={row.ati_id ?? "—"} />
        <Row label="Телефон в ATI" value={row.ati_phone ?? "—"} />
        <Row label="Email в ATI" value={row.ati_email ?? "—"} />
        <div className="pt-2">
          <ContactLinks phone={row.phone} whatsapp={row.whatsapp} telegram={row.telegram} max_messenger={row.max_messenger} email={row.email} />
        </div>
      </Section>

      {/* 3. Компания / юрлицо */}
      <Section title="Компания / юрлицо">
        <Row label="Название" value={row.name ?? "—"} />
        <Row label="ИНН" value={row.inn ?? "—"} />
        <Row label="ОГРН / ОГРНИП" value={row.ogrn ?? "—"} />
        <Row label="Налоговый режим" value={taxLabel} />
        <Row label="НДС" value={row.tax_regime === "osno" ? "С НДС" : "Без НДС"} />
        <Row label="Банк" value={row.bank_name ?? "—"} />
        <Row label="Р/счёт" value={row.bank_account ?? "—"} />
        <Row label="БИК" value={row.bank_bik ?? "—"} />
        <Row label="Корр. счёт" value={row.bank_corr_account ?? "—"} />
        <div className="pt-2 text-xs text-muted-foreground">
          Юридические данные редактируются через кнопку «Редактировать».
          Привязка нескольких юрлиц к одному перевозчику — в работе.
        </div>
      </Section>

      {/* 4. Кабинет перевозчика */}
      <Section title="Кабинет перевозчика" hint="Кабинет нужен, чтобы перевозчик мог сам заходить, видеть предложения, добавлять транспорт, водителей и вести рейсы.">
        <CarrierUserLinkBlock carrierExtId={row.id} />
      </Section>

      {/* 5. Регистрация по ссылке */}
      <Section title="Регистрация по ссылке" hint="Ссылка нужна, чтобы перевозчик сам заполнил анкету, добавил документы, транспорт и водителей. Если диспетчер уже добавил данные вручную, ссылку можно не использовать.">
        <CarrierRegistrationBlock carrierId={row.id} formSubmittedAt={row.commission_agreed_at} />
      </Section>

      {/* 6. Договор и комиссия — единый блок */}
      <Section title="Договор и комиссия">
        <CarrierContractAcceptanceBlock carrierId={row.id} currentCommissionRate={row.commission_rate} />
        <div className="mt-3 space-y-1">
          <Row
            label="Статус"
            value={row.commission_agreed ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Принят
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700">
                <AlertTriangle className="h-3 w-3" /> Не принят
              </Badge>
            )}
          />
          <Row label="Ставка комиссии" value={`${(row.commission_rate * 100).toFixed(1)}%`} />
          <Row label="Дата согласия" value={row.commission_agreed_at ? new Date(row.commission_agreed_at).toLocaleString("ru-RU") : "—"} />
          <Row label="ФИО согласия" value={row.commission_agreed_by ?? "—"} />
          <Row label="Способ оплаты" value={row.commission_payment_method ?? row.payment_method ?? "—"} />
        </div>
      </Section>

      {/* 7. Документы */}
      <Section title="Документы">
        <DispatcherDocumentsBlock ownerType="carrier" ownerId={row.id} />
      </Section>

      {/* ЭПД-готовность перевозчика (read-only) */}
      <Section title="Готовность к ЭПД">
        <DispatcherCarrierEpdReadinessSummary carrierExtId={row.id} />
      </Section>


      {/* 8. Водители перевозчика */}
      <Section title={`Водители (${drivers.length})`}>
        {drivers.length === 0 ? (
          <div className="text-xs text-muted-foreground">Водители не привязаны.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ФИО</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Город</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.full_name ?? "—"}</TableCell>
                    <TableCell>{d.phone ?? "—"}</TableCell>
                    <TableCell>{d.city ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {DRIVER_STATUS_LABELS[d.dispatcher_status as DriverStatus] ?? d.dispatcher_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {/* 9. Транспорт перевозчика */}
      <Section title={`Транспорт (${vehicles.length})`}>
        {vehicles.length === 0 ? (
          <div className="text-xs text-muted-foreground">Транспорт не добавлен.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Кузов</TableHead>
                  <TableHead>Грузоп.</TableHead>
                  <TableHead>Объём</TableHead>
                  <TableHead>Город</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.body_type ?? v.vehicle_kind ?? "—"}</TableCell>
                    <TableCell>{v.payload_kg != null ? `${v.payload_kg} кг` : "—"}</TableCell>
                    <TableCell>{v.volume_m3 != null ? `${v.volume_m3} м³` : "—"}</TableCell>
                    <TableCell>{v.home_city ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {VEHICLE_STATUS_LABELS[v.dispatcher_status as VehicleStatus] ?? v.dispatcher_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {/* 10. История предложений и сделок */}
      <Section title="История предложений и сделок" hint="Заявки и сделки создаются от груза: подобрать машину → отправить предложение → создать сделку.">
        <DispatcherCarrierRequestsBlock
          carrierExtId={row.id}
          carrierName={row.name ?? null}
          historyOnly
        />
      </Section>

      {/* Проверка перевозчика — рабочее действие диспетчера */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">Проверка перевозчика</span>
          <StatusBadge
            status={row.verification_status}
            label={CARRIER_STATUS_LABELS[row.verification_status as keyof typeof CARRIER_STATUS_LABELS] ?? row.verification_status}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={row.verification_status === "ready_to_work" ? "default" : "outline"}
            onClick={() => onVerify("ready_to_work")}
          >
            <ShieldCheck className="h-4 w-4 mr-1" /> Готов к работе
          </Button>
          <Button
            size="sm"
            variant={row.verification_status === "on_check" ? "default" : "outline"}
            onClick={() => onVerify("on_check")}
          >
            На проверке
          </Button>
          <Button
            size="sm"
            variant={row.verification_status === "missing_docs" ? "destructive" : "outline"}
            onClick={() => setShowDocsField(true)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" /> Не хватает документов
          </Button>
          <Button
            size="sm"
            variant={row.verification_status === "blocked" ? "destructive" : "outline"}
            onClick={() => {
              if (confirm("Заблокировать перевозчика?")) onVerify("blocked");
            }}
          >
            <ShieldOff className="h-4 w-4 mr-1" /> Заблокировать
          </Button>
        </div>
        {showDocsField && (
          <div className="space-y-2 pt-1">
            <Textarea
              placeholder="Каких документов не хватает / комментарий"
              value={docsComment}
              onChange={(e) => setDocsComment(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onVerify("missing_docs", docsComment)}
            >
              Сохранить «Не хватает документов»
            </Button>
          </div>
        )}
        {row.dispatcher_comment && (
          <div className="text-xs text-muted-foreground pt-1">
            Комментарий: {row.dispatcher_comment}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="font-medium">{title}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}


function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-36 text-muted-foreground">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}

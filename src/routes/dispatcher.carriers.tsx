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
import { Pencil, Archive, Eye, CheckCircle2, AlertTriangle, ShieldCheck, ShieldOff } from "lucide-react";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { ContactLinks } from "@/components/dispatcher/ContactLinks";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { CarrierForm } from "@/components/dispatcher/CarrierForm";
import { InviteLinkButton } from "@/components/dispatcher/InviteLinkButton";
import { CarrierRegistrationBlock } from "@/components/dispatcher/CarrierRegistrationBlock";
import { CarrierUserLinkBlock } from "@/components/dispatcher/CarrierUserLinkBlock";
import { DispatcherDocumentsBlock } from "@/components/dispatcher/DispatcherDocumentsBlock";
import { DispatcherPartnerCardBlock } from "@/components/dispatcher/DispatcherPartnerCardBlock";
import { DispatcherCarrierRequestsBlock } from "@/components/dispatcher/DispatcherCarrierRequestsBlock";
import { CarrierContractAcceptanceBlock } from "@/components/dispatcher/CarrierContractAcceptanceBlock";
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
          <Select value={quick} onValueChange={(v) => setQuick(v as QuickFilter)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Быстрый фильтр" /></SelectTrigger>
            <SelectContent>
              {QUICK_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
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
                  <InviteLinkButton entityType="carrier" entityId={r.id} inviteType="carrier_registration" />
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

  return (
    <div className="space-y-4 text-sm">
      {/* Кабинет перевозчика — главное действие */}
      <CarrierUserLinkBlock carrierExtId={row.id} />

      {/* Договор-оферта и комиссия */}
      <CarrierContractAcceptanceBlock
        carrierId={row.id}
        currentCommissionRate={row.commission_rate}
      />

      {/* Согласие на комиссию — компактно */}
      <div className="rounded-md border p-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">Договор и комиссия</span>
          {row.commission_agreed ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {(row.commission_rate * 100).toFixed(0)}% подтверждено
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700">
              <AlertTriangle className="h-3 w-3" /> Нет согласия
            </Badge>
          )}
        </div>
        <Row label="Ставка" value={`${(row.commission_rate * 100).toFixed(1)}%`} />
        <Row label="Дата согласия" value={row.commission_agreed_at ? new Date(row.commission_agreed_at).toLocaleString("ru-RU") : "—"} />
        <Row label="ФИО согласия" value={row.commission_agreed_by ?? "—"} />
        <details className="pt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Показать подробности</summary>
          <div className="mt-2 space-y-1">
            <Row label="Способ оплаты" value={row.commission_payment_method ?? row.payment_method ?? "—"} />
            {row.commission_agreement_text && (
              <Row label="Текст согласия" value={<span className="text-xs text-muted-foreground">{row.commission_agreement_text}</span>} />
            )}
          </div>
        </details>
      </div>

      {/* Дополнительно — технические блоки */}
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer font-medium">Дополнительно</summary>
        <div className="mt-3 space-y-4">
          <CarrierRegistrationBlock
            carrierId={row.id}
            formSubmittedAt={row.commission_agreed_at}
          />
          <DispatcherDocumentsBlock ownerType="carrier" ownerId={row.id} />
          <DispatcherPartnerCardBlock carrierExtId={row.id} />
          <DispatcherCarrierRequestsBlock carrierExtId={row.id} carrierName={row.name ?? null} />
        </div>
      </details>





      {/* Проверка перевозчика */}
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
      </div>

      {/* Реквизиты и контакты */}
      <div className="rounded-md border p-3 space-y-1">
        <div className="font-medium mb-1">Реквизиты и контакты</div>
        <Row label="Тип" value={row.carrier_kind ? CARRIER_KIND_LABELS[row.carrier_kind as CarrierKind] ?? row.carrier_kind : "—"} />
        <Row label="ИНН" value={row.inn ?? "—"} />
        <Row label="ОГРН" value={row.ogrn ?? "—"} />
        <Row label="Город" value={row.city ?? "—"} />
        <Row label="Телефон" value={row.phone ?? "—"} />
        <Row label="Email" value={row.email ?? "—"} />
        <Row label="WhatsApp" value={row.whatsapp ?? "—"} />
        <Row label="Telegram" value={row.telegram ?? "—"} />
        <Row label="Max" value={row.max_messenger ?? "—"} />
        <Row label="Банк" value={row.bank_name ?? "—"} />
        <Row label="Р/счёт" value={row.bank_account ?? "—"} />
        <Row label="БИК" value={row.bank_bik ?? "—"} />
        <Row label="Комментарий" value={row.dispatcher_comment ?? "—"} />
        <div className="pt-2 flex gap-2">
          <ContactLinks phone={row.phone} whatsapp={row.whatsapp} telegram={row.telegram} max_messenger={row.max_messenger} email={row.email} />
        </div>
      </div>
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

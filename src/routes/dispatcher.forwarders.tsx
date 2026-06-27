// Раздел диспетчера: справочник экспедиторов (dispatcher_forwarder_ext)
// со статусами и read-only бейджем ГосЛог.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { apiGetAuth, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { DispatcherForwarderGoslogSummary } from "@/components/edo/DispatcherForwarderGoslogSummary";

export const Route = createFileRoute("/dispatcher/forwarders")({
  component: DispatcherForwardersPage,
});

type Status =
  | "new" | "on_check" | "ready_to_work" | "missing_docs" | "blocked" | "archive";

interface Row {
  id: string;
  company_name: string;
  inn: string | null;
  ogrn: string | null;
  legal_form: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  city: string | null;
  website: string | null;
  okved_codes: string[];
  has_okved_5229: boolean;
  status: Status;
  dispatcher_comment: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<Status, string> = {
  new: "Новый",
  on_check: "На проверке",
  ready_to_work: "Готов к работе",
  missing_docs: "Не хватает документов",
  blocked: "Заблокирован",
  archive: "В архиве",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  new: "outline",
  on_check: "secondary",
  ready_to_work: "default",
  missing_docs: "secondary",
  blocked: "destructive",
  archive: "outline",
};

function emptyForm(): Partial<Row> {
  return {
    company_name: "", inn: "", ogrn: "", legal_form: "", phone: "", email: "",
    contact_person: "", city: "", website: "", okved_codes: [],
    has_okved_5229: false, status: "new", dispatcher_comment: "",
  };
}

function DispatcherForwardersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<Partial<Row>>(emptyForm());

  const listQ = useQuery({
    queryKey: ["dispatcher", "forwarders-ext", search, status, includeArchived],
    queryFn: () => apiGetAuth<{ rows: Row[] }>(
      `/api/dispatcher/forwarders-ext?search=${encodeURIComponent(search)}` +
      `&status=${status}&includeArchived=${includeArchived ? "1" : "0"}`,
    ),
  });

  const create = useMutation({
    mutationFn: () => apiPost<{ row: Row }>("/api/dispatcher/forwarders-ext", form),
    onSuccess: r => {
      toast.success("Экспедитор добавлен");
      qc.invalidateQueries({ queryKey: ["dispatcher", "forwarders-ext"] });
      setCreateOpen(false);
      setForm(emptyForm());
      setOpenId(r.row.id);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const rows = listQ.data?.rows ?? [];
  const opened = useMemo(() => rows.find(r => r.id === openId) ?? null, [rows, openId]);

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-3 max-w-6xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Экспедиторы</h1>
        <Button size="sm" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
          Добавить экспедитора
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Справочник экспедиторов диспетчера со статусом работы и сводкой ГосЛог.
        Статус ГосЛог нужно проверять по официальному источнику —
        Радиус Трек хранит отметку проверки и показывает её диспетчеру.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Поиск по ИНН или названию"
            value={search} onChange={e => setSearch(e.target.value)}
            className="sm:col-span-2"
          />
          <Select value={status} onValueChange={v => setStatus(v as Status | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={includeArchived}
              onCheckedChange={v => setIncludeArchived(Boolean(v))} />
            Показывать архив
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Список ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <div className="text-xs text-muted-foreground">Загрузка…</div>
          ) : rows.length === 0 ? (
            <div className="text-xs text-muted-foreground">Пока нет экспедиторов.</div>
          ) : (
            <div className="space-y-1.5">
              {rows.map(r => (
                <div key={r.id}
                  className="rounded-md border p-2 flex items-start justify-between gap-2 text-sm">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{r.company_name}</span>
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {r.has_okved_5229 && <Badge variant="outline">ОКВЭД 52.29</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.inn ? `ИНН ${r.inn}` : "ИНН не указан"}
                      {r.city ? ` · ${r.city}` : ""}
                      {r.phone ? ` · ${r.phone}` : ""}
                      {r.email ? ` · ${r.email}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>
                    Открыть карточку
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Новый экспедитор</DialogTitle>
            <DialogDescription>
              Заполните основные данные. Статус ГосЛог фиксируется отдельно.
            </DialogDescription>
          </DialogHeader>
          <ForwarderFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!openId} onOpenChange={v => { if (!v) setOpenId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{opened?.company_name ?? "Карточка экспедитора"}</DialogTitle>
          </DialogHeader>
          {opened && (
            <ForwarderDetail
              row={opened}
              onUpdated={() => qc.invalidateQueries({ queryKey: ["dispatcher", "forwarders-ext"] })}
              onArchived={() => {
                qc.invalidateQueries({ queryKey: ["dispatcher", "forwarders-ext"] });
                setOpenId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ForwarderFormFields({
  form, setForm,
}: {
  form: Partial<Row>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Row>>>;
}) {
  const okvedText = (form.okved_codes ?? []).join(", ");
  return (
    <div className="grid gap-2 sm:grid-cols-2 text-sm">
      <div className="sm:col-span-2">
        <Label>Название компании *</Label>
        <Input value={form.company_name ?? ""} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
      </div>
      <div><Label>ИНН</Label><Input value={form.inn ?? ""} onChange={e => setForm(p => ({ ...p, inn: e.target.value }))} /></div>
      <div><Label>ОГРН</Label><Input value={form.ogrn ?? ""} onChange={e => setForm(p => ({ ...p, ogrn: e.target.value }))} /></div>
      <div><Label>Орг-правовая форма</Label><Input value={form.legal_form ?? ""} onChange={e => setForm(p => ({ ...p, legal_form: e.target.value }))} /></div>
      <div><Label>Город</Label><Input value={form.city ?? ""} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
      <div><Label>Телефон</Label><Input value={form.phone ?? ""} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
      <div><Label>Email</Label><Input value={form.email ?? ""} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
      <div><Label>Контактное лицо</Label><Input value={form.contact_person ?? ""} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} /></div>
      <div><Label>Сайт</Label><Input value={form.website ?? ""} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} /></div>
      <div className="sm:col-span-2">
        <Label>ОКВЭД (через запятую)</Label>
        <Input value={okvedText}
          onChange={e => setForm(p => ({
            ...p,
            okved_codes: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
          }))} />
      </div>
      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <Checkbox checked={!!form.has_okved_5229}
          onCheckedChange={v => setForm(p => ({ ...p, has_okved_5229: Boolean(v) }))} />
        ОКВЭД 52.29 присутствует
      </label>
      <div className="sm:col-span-2">
        <Label>Комментарий диспетчера</Label>
        <Textarea rows={2} value={form.dispatcher_comment ?? ""}
          onChange={e => setForm(p => ({ ...p, dispatcher_comment: e.target.value }))} />
      </div>
    </div>
  );
}

function ForwarderDetail({
  row, onUpdated, onArchived,
}: { row: Row; onUpdated: () => void; onArchived: () => void }) {
  const [edit, setEdit] = useState<Partial<Row>>(row);
  const update = useMutation({
    mutationFn: (patch: Partial<Row>) =>
      apiPatch<{ row: Row }>(`/api/dispatcher/forwarders-ext/${row.id}`, patch),
    onSuccess: () => { toast.success("Сохранено"); onUpdated(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const archive = useMutation({
    mutationFn: () => apiDelete(`/api/dispatcher/forwarders-ext/${row.id}`),
    onSuccess: () => { toast.success("Архивировано"); onArchived(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  function setStatus(s: Status) {
    update.mutate({ status: s });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setStatus("on_check")}>На проверке</Button>
        <Button size="sm" onClick={() => setStatus("ready_to_work")}>Готов к работе</Button>
        <Button size="sm" variant="outline" onClick={() => setStatus("missing_docs")}>Не хватает документов</Button>
        <Button size="sm" variant="destructive" onClick={() => setStatus("blocked")}>Заблокировать</Button>
        <Button size="sm" variant="ghost" onClick={() => archive.mutate()} disabled={archive.isPending}>
          Архивировать
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Реквизиты и контакты</CardTitle></CardHeader>
        <CardContent>
          <ForwarderFormFields form={edit} setForm={setEdit} />
          <div className="pt-2 flex justify-end">
            <Button size="sm" onClick={() => update.mutate(edit)} disabled={update.isPending}>
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      <DispatcherForwarderGoslogSummary forwarderId={row.id} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">ЭПД-документы экспедитора</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Будет подключено на следующем этапе.
        </CardContent>
      </Card>
    </div>
  );
}

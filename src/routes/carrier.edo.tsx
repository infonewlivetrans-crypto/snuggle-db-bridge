import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  EDO_PROVIDER_OPTIONS, EDO_PROVIDER_LABEL, EDO_CONNECTION_STATUS_LABEL,
  EDO_DOC_STATUS_LABEL, edoDocStatusVariant, edoAwaitingLabel,
  EDO_DOC_TYPE_OPTIONS, EDO_DOC_TYPE_LABEL, EDO_DOC_DIRECTION_LABEL,
  type EdoDocStatus, type EdoProvider, type EdoParticipantRole,
  type EdoDocDirection, type EdoDocType,
} from "@/lib/edo/constants";
import { useEdoModuleEnabled } from "@/lib/mvp-features";
import {
  FileText, Plus, RefreshCcw, Settings2, Trash2, Star, Inbox, Send, Download,
} from "lucide-react";

export const Route = createFileRoute("/carrier/edo")({
  head: () => ({ meta: [{ title: "ЭТрН / ЭДО — Радиус Трек" }] }),
  component: CarrierEdoPage,
});

interface ConnectionDTO {
  id: string;
  provider: EdoProvider;
  status: string;
  environment: "test" | "production";
  is_default: boolean;
  organization_name: string | null;
  organization_inn: string | null;
  last_check_at: string | null;
  last_check_status: string | null;
  error_message: string | null;
}

interface DocRow {
  id: string;
  doc_number: string | null;
  status: EdoDocStatus;
  direction: EdoDocDirection;
  document_type: EdoDocType;
  title: string | null;
  route_summary: string | null;
  shipper_name: string | null;
  consignee_name: string | null;
  provider: EdoProvider;
  awaiting_role: EdoParticipantRole | null;
  created_at: string;
  meta?: Record<string, unknown> | null;
}

function CarrierEdoPage() {
  const enabled = useEdoModuleEnabled();
  const qc = useQueryClient();

  const connQ = useQuery({
    queryKey: ["edo", "connections"],
    queryFn: () =>
      apiGetAuth<{ connections: ConnectionDTO[]; connection: ConnectionDTO | null }>(
        "/api/carrier/edo/connection",
      ),
    enabled,
  });

  const docsQ = useQuery({
    queryKey: ["edo", "documents"],
    queryFn: () => apiGetAuth<{ rows: DocRow[] }>("/api/carrier/edo/documents"),
    enabled,
  });

  if (!enabled) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Модуль ЭТрН / ЭДО временно отключён администратором.
        </CardContent>
      </Card>
    );
  }

  const connections = connQ.data?.connections ?? [];
  const docs = docsQ.data?.rows ?? [];

  const invalidateConn = () => qc.invalidateQueries({ queryKey: ["edo", "connections"] });
  const invalidateDocs = () => qc.invalidateQueries({ queryKey: ["edo", "documents"] });

  const filt = {
    all: docs,
    incoming: docs.filter(d => d.direction === "incoming"),
    outgoing: docs.filter(d => d.direction === "outgoing" || d.direction === "internal"),
    waiting: docs.filter(d =>
      d.status === "waiting_carrier_signature" ||
      d.status === "waiting_shipper_signature" ||
      d.status === "waiting_driver_action" ||
      d.status === "waiting_consignee_signature",
    ),
    errors: docs.filter(d => d.status === "error" || d.status === "rejected_by_operator"),
    closed: docs.filter(d => d.status === "closed" || d.status === "signed"),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link
          to="/carrier/edo/counterparties"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40"
        >
          <FileText className="h-4 w-4" />Контрагенты ЭДО
        </Link>
      </div>
      {/* Connections */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Ваши операторы ЭДО</CardTitle>
          <ConnectionDialog onSaved={invalidateConn} />
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Операторы пока не подключены. Документы можно вести во внутреннем режиме Радиус Трек.
              Специалист Радиус Трек поможет настроить ЭДО позже.
            </div>
          ) : (
            <div className="space-y-2">
              {connections.map(c => (
                <ConnectionRow key={c.id} conn={c} onChanged={invalidateConn} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Документы ЭДО</CardTitle>
          <div className="flex gap-2">
            <CreateTestIncomingButton onCreated={invalidateDocs} />
            <CreateDocDialog
              connections={connections}
              onCreated={invalidateDocs}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-3">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="all">Все ({filt.all.length})</TabsTrigger>
              <TabsTrigger value="incoming">Входящие ({filt.incoming.length})</TabsTrigger>
              <TabsTrigger value="outgoing">Исходящие ({filt.outgoing.length})</TabsTrigger>
              <TabsTrigger value="waiting">Ждут подписи ({filt.waiting.length})</TabsTrigger>
              <TabsTrigger value="errors">Ошибки ({filt.errors.length})</TabsTrigger>
              <TabsTrigger value="closed">Закрытые ({filt.closed.length})</TabsTrigger>
            </TabsList>
            {(["all", "incoming", "outgoing", "waiting", "errors", "closed"] as const).map(k => (
              <TabsContent key={k} value={k}>
                <DocList rows={filt[k]} loading={docsQ.isLoading} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <CarrierEpdReadinessBlock />
      <EpdTrainingBlock role="carrier" />
    </div>
  );
}

function DocList({ rows, loading }: { rows: DocRow[]; loading: boolean }) {
  if (loading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">Документов нет.</div>;
  return (
    <div className="space-y-2">
      {rows.map(d => {
        const meta = (d.meta ?? {}) as Record<string, unknown>;
        const fromRoute = meta.created_from_route === true;
        const routeNumber = (meta.route_number as string | null | undefined) ?? null;
        return (
          <Link
            key={d.id}
            to="/carrier/edo/$id" params={{ id: d.id }}
            className="block rounded-md border p-3 text-sm hover:bg-muted/40 transition"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {d.direction === "incoming"
                  ? <Inbox className="h-4 w-4 text-muted-foreground" />
                  : <FileText className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium">
                  {d.title ?? d.doc_number ?? `${EDO_DOC_TYPE_LABEL[d.document_type]} ${d.id.slice(0, 8)}`}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {EDO_DOC_DIRECTION_LABEL[d.direction]}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {EDO_DOC_TYPE_LABEL[d.document_type]}
                </Badge>
                {fromRoute && (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                    Создан из рейса{routeNumber ? ` ${routeNumber}` : ""}
                  </Badge>
                )}
                <Badge variant={edoDocStatusVariant(d.status)}>{EDO_DOC_STATUS_LABEL[d.status]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(d.created_at).toLocaleString("ru-RU")}
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {EDO_PROVIDER_LABEL[d.provider]}
              {d.shipper_name ? ` · от ${d.shipper_name}` : ""}
              {d.consignee_name ? ` → ${d.consignee_name}` : ""}
              {d.route_summary ? ` · ${d.route_summary}` : ""}
            </div>
            {d.awaiting_role && (
              <div className="mt-1 text-xs text-amber-700">{edoAwaitingLabel(d.awaiting_role)}</div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function ConnectionRow({ conn, onChanged }: { conn: ConnectionDTO; onChanged: () => void }) {
  const testM = useMutation({
    mutationFn: () => apiPost(`/api/carrier/edo/connection/${conn.id}?op=test`, {}),
    onSuccess: () => { toast.success("Подключение проверено"); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка проверки"),
  });
  const setDefaultM = useMutation({
    mutationFn: () => apiPost(`/api/carrier/edo/connection/${conn.id}?op=set-default`, {}),
    onSuccess: () => { toast.success("Основной оператор выбран"); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const deleteM = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/carrier/edo/connection/${conn.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => { toast.success("Подключение удалено"); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  return (
    <div className="rounded-md border p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <b>{EDO_PROVIDER_LABEL[conn.provider]}</b>
          {conn.is_default && (
            <Badge variant="default" className="text-[10px]">основной</Badge>
          )}
          <Badge
            variant={conn.status === "connected" ? "default" :
              conn.status === "error" ? "destructive" : "outline"}
          >
            {EDO_CONNECTION_STATUS_LABEL[conn.status as keyof typeof EDO_CONNECTION_STATUS_LABEL]
              ?? conn.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{conn.environment}</span>
        </div>
        {conn.organization_name && (
          <div className="text-xs text-muted-foreground">
            {conn.organization_name}{conn.organization_inn ? ` (ИНН ${conn.organization_inn})` : ""}
          </div>
        )}
        {conn.error_message && (
          <div className="text-xs text-destructive">Ошибка: {conn.error_message}</div>
        )}
      </div>
      <div className="flex gap-1.5">
        {!conn.is_default && (
          <Button size="sm" variant="ghost" onClick={() => setDefaultM.mutate()}
            disabled={setDefaultM.isPending}>
            <Star className="h-3.5 w-3.5 mr-1" /> Основным
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => testM.mutate()}
          disabled={testM.isPending}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Проверить
        </Button>
        <ConnectionDialog existing={conn} onSaved={onChanged} />
        <Button size="sm" variant="ghost"
          onClick={() => { if (confirm("Удалить подключение?")) deleteM.mutate(); }}
          disabled={deleteM.isPending}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function ConnectionDialog(
  { existing, onSaved }: { existing?: ConnectionDTO; onSaved: () => void },
) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<EdoProvider>(existing?.provider ?? "internal_mock");
  const [environment, setEnvironment] = useState<"test" | "production">(
    existing?.environment ?? "test");
  const [orgName, setOrgName] = useState(existing?.organization_name ?? "");
  const [orgInn, setOrgInn] = useState(existing?.organization_inn ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [comment, setComment] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  const save = useMutation({
    mutationFn: () => apiPost("/api/carrier/edo/connection", {
      id: existing?.id ?? null,
      provider, environment,
      organization_name: orgName || null,
      organization_inn: orgInn || null,
      api_key: apiKey || undefined,
      client_id: clientId || undefined,
      client_secret: clientSecret || undefined,
      comment: comment || null,
      is_default: makeDefault || undefined,
    }),
    onSuccess: () => {
      toast.success("Сохранено");
      setApiKey(""); setClientSecret(""); setClientId("");
      setOpen(false); onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={existing ? "ghost" : "default"}>
          {existing ? <Settings2 className="h-3.5 w-3.5" /> : (<><Plus className="h-4 w-4 mr-1.5" />Добавить оператора</>)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Подключение ЭДО" : "Новое подключение ЭДО"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Оператор</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as EdoProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EDO_PROVIDER_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider === "internal_mock" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Внутренний режим Радиус Трек. Можно вести документы и тестировать сценарий
                без реального оператора.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Среда</Label>
              <Select value={environment}
                onValueChange={(v) => setEnvironment(v as "test" | "production")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Тест</SelectItem>
                  <SelectItem value="production">Боевая</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ИНН организации</Label>
              <Input value={orgInn} onChange={(e) => setOrgInn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Название организации</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          {provider !== "internal_mock" && provider !== "other" && (
            <>
              <div>
                <Label>API key</Label>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={existing ? "•••••• сохранено (оставьте пустым)" : ""}
                  type="password" autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Client ID</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)}
                    placeholder={existing ? "•••••• сохранено" : ""} autoComplete="off" />
                </div>
                <div>
                  <Label>Client secret</Label>
                  <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={existing ? "•••••• сохранено" : ""}
                    type="password" autoComplete="off" />
                </div>
              </div>
            </>
          )}
          <div>
            <Label>Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
          {!existing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)} />
              Сделать основным оператором
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTestIncomingButton({ onCreated }: { onCreated: () => void }) {
  const m = useMutation({
    mutationFn: () => apiPost("/api/carrier/edo/documents", {
      direction: "incoming",
      document_type: "etrn",
      title: `Тестовая ЭТрН ${new Date().toLocaleString("ru-RU")}`,
      shipper_name: "ООО Тестовый Грузоотправитель",
      shipper_inn: "7700000000",
      consignee_name: "ООО Тестовый Грузополучатель",
      consignee_inn: "7800000000",
      route_summary: "Москва → Казань",
      cargo_summary: "Тестовый груз 1 т",
    }),
    onSuccess: () => { toast.success("Создан тестовый входящий документ"); onCreated(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      <Download className="h-4 w-4 mr-1.5" /> Создать тестовый входящий
    </Button>
  );
}

function CreateDocDialog(
  { connections, onCreated }: { connections: ConnectionDTO[]; onCreated: () => void },
) {
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<EdoDocType>("etrn");
  const [title, setTitle] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [shipper, setShipper] = useState("");
  const [shipperInn, setShipperInn] = useState("");
  const [shipperProvider, setShipperProvider] = useState<string>("none");
  const [consignee, setConsignee] = useState("");
  const [consigneeInn, setConsigneeInn] = useState("");
  const [consigneeProvider, setConsigneeProvider] = useState<string>("none");
  const [route, setRoute] = useState("");
  const [cargo, setCargo] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const defaultConnId = connections.find(c => c.is_default)?.id ?? connections[0]?.id ?? "";
  const [connectionId, setConnectionId] = useState<string>(defaultConnId);

  const create = useMutation({
    mutationFn: () => apiPost<{ id: string }>("/api/carrier/edo/documents", {
      direction: "outgoing",
      document_type: docType,
      title: title || null,
      doc_number: docNumber || null,
      connection_id: connectionId || null,
      shipper_name: shipper || null,
      shipper_inn: shipperInn || null,
      shipper_provider: shipperProvider === "none" ? null : shipperProvider,
      consignee_name: consignee || null,
      consignee_inn: consigneeInn || null,
      consignee_provider: consigneeProvider === "none" ? null : consigneeProvider,
      route_summary: route || null,
      cargo_summary: cargo || null,
      vehicle_label: vehicle || null,
      driver_label: driver || null,
    }),
    onSuccess: () => {
      toast.success("Документ создан");
      setOpen(false); onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const realConnSelected = connections.find(c => c.id === connectionId);
  const isMockOrEmpty = !realConnSelected || realConnSelected.provider === "internal_mock";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Send className="h-4 w-4 mr-1.5" /> Создать исходящий</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Новый исходящий документ</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Тип документа</Label>
              <Select value={docType} onValueChange={v => setDocType(v as EdoDocType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EDO_DOC_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Номер</Label>
              <Input value={docNumber} onChange={e => setDocNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Заголовок</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Например: ЭТрН №123 от 20.06.2026" />
          </div>
          {connections.length > 0 && (
            <div>
              <Label>Через оператора</Label>
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {connections.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {EDO_PROVIDER_LABEL[c.provider]}{c.is_default ? " (основной)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Грузоотправитель</Label>
              <Input value={shipper} onChange={e => setShipper(e.target.value)} />
            </div>
            <div>
              <Label>ИНН</Label>
              <Input value={shipperInn} onChange={e => setShipperInn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Оператор грузоотправителя</Label>
            <Select value={shipperProvider} onValueChange={setShipperProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Не указан —</SelectItem>
                {EDO_PROVIDER_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Грузополучатель</Label>
              <Input value={consignee} onChange={e => setConsignee(e.target.value)} />
            </div>
            <div>
              <Label>ИНН</Label>
              <Input value={consigneeInn} onChange={e => setConsigneeInn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Оператор грузополучателя</Label>
            <Select value={consigneeProvider} onValueChange={setConsigneeProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Не указан —</SelectItem>
                {EDO_PROVIDER_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Маршрут</Label>
            <Input value={route} onChange={e => setRoute(e.target.value)}
              placeholder="Москва → Казань" />
          </div>
          <div>
            <Label>Груз</Label>
            <Input value={cargo} onChange={e => setCargo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Машина</Label>
              <Input value={vehicle} onChange={e => setVehicle(e.target.value)} />
            </div>
            <div>
              <Label>Водитель</Label>
              <Input value={driver} onChange={e => setDriver(e.target.value)} />
            </div>
          </div>
          {isMockOrEmpty && (
            <p className="text-xs text-muted-foreground">
              Отправка через оператора будет доступна после настройки.
              Сейчас документ будет создан во внутреннем режиме Радиус Трек.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

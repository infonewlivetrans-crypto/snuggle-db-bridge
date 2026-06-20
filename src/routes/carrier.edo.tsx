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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  EDO_PROVIDER_OPTIONS, EDO_PROVIDER_LABEL, EDO_CONNECTION_STATUS_LABEL,
  EDO_DOC_STATUS_LABEL, edoDocStatusVariant, edoAwaitingLabel,
  type EdoDocStatus, type EdoProvider, type EdoParticipantRole,
} from "@/lib/edo/constants";
import { useEdoModuleEnabled } from "@/lib/mvp-features";
import { FileText, Plus, RefreshCcw, Settings2 } from "lucide-react";

export const Route = createFileRoute("/carrier/edo")({
  head: () => ({ meta: [{ title: "ЭТрН / ЭДО — Радиус Трек" }] }),
  component: CarrierEdoPage,
});

interface ConnectionDTO {
  id: string;
  provider: EdoProvider;
  status: string;
  environment: "test" | "production";
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
  route_summary: string | null;
  shipper_name: string | null;
  consignee_name: string | null;
  vehicle_label: string | null;
  driver_label: string | null;
  awaiting_role: EdoParticipantRole | null;
  created_at: string;
  updated_at: string;
}

function CarrierEdoPage() {
  const enabled = useEdoModuleEnabled();
  const qc = useQueryClient();

  const connQ = useQuery({
    queryKey: ["edo", "connection"],
    queryFn: () => apiGetAuth<{ connection: ConnectionDTO | null }>("/api/carrier/edo/connection"),
    enabled,
  });

  const docsQ = useQuery({
    queryKey: ["edo", "documents"],
    queryFn: () => apiGetAuth<{ rows: DocRow[] }>("/api/carrier/edo/documents"),
    enabled,
  });

  const testM = useMutation({
    mutationFn: () => apiPost("/api/carrier/edo/connection/test", {}),
    onSuccess: () => { toast.success("Подключение проверено"); qc.invalidateQueries({ queryKey: ["edo", "connection"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка проверки"),
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

  const conn = connQ.data?.connection ?? null;
  const docs = docsQ.data?.rows ?? [];

  const counts = {
    waiting_carrier_signature: docs.filter(d => d.status === "waiting_carrier_signature").length,
    waiting_driver_action: docs.filter(d => d.status === "waiting_driver_action").length,
    signed: docs.filter(d => d.status === "signed").length,
    error: docs.filter(d => d.status === "error").length,
    closed: docs.filter(d => d.status === "closed").length,
    created: docs.filter(d => d.status === "created" || d.status === "draft").length,
  };

  return (
    <div className="space-y-5">
      {/* Connection block */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Ваш оператор ЭДО</CardTitle>
          <div className="flex gap-2">
            <ConnectionDialog conn={conn} onSaved={() => qc.invalidateQueries({ queryKey: ["edo", "connection"] })} />
            <Button
              size="sm" variant="outline"
              onClick={() => testM.mutate()}
              disabled={!conn || testM.isPending}
            >
              <RefreshCcw className="h-4 w-4 mr-1.5" />
              Проверить подключение
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {conn ? (
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Оператор:</span> <b>{EDO_PROVIDER_LABEL[conn.provider]}</b></div>
              <div>
                <span className="text-muted-foreground">Статус:</span>{" "}
                <Badge variant={conn.status === "connected" ? "default" : conn.status === "error" ? "destructive" : "outline"}>
                  {EDO_CONNECTION_STATUS_LABEL[conn.status as keyof typeof EDO_CONNECTION_STATUS_LABEL] ?? conn.status}
                </Badge>
              </div>
              <div><span className="text-muted-foreground">Среда:</span> {conn.environment}</div>
              {conn.organization_name && (
                <div><span className="text-muted-foreground">Организация:</span> {conn.organization_name} {conn.organization_inn ? `(ИНН ${conn.organization_inn})` : ""}</div>
              )}
              {conn.error_message && (
                <div className="text-destructive">Ошибка: {conn.error_message}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Оператор ЭДО пока не подключен. Документы можно вести во внутреннем режиме Радиус Трек.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          ["created", "Новые/черновики", counts.created],
          ["waiting_carrier_signature", "Ждут моей подписи", counts.waiting_carrier_signature],
          ["waiting_driver_action", "Ждут водителя", counts.waiting_driver_action],
          ["signed", "Подписанные", counts.signed],
          ["error", "Ошибки", counts.error],
          ["closed", "Закрытые", counts.closed],
        ].map(([_k, label, n]) => (
          <Card key={String(label)} className="py-2">
            <CardContent className="py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold">{Number(n)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Документы ЭТрН</CardTitle>
          <CreateDocDialog onCreated={() => qc.invalidateQueries({ queryKey: ["edo", "documents"] })} />
        </CardHeader>
        <CardContent>
          {docsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Загрузка…</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Документов пока нет.</div>
          ) : (
            <div className="space-y-2">
              {docs.map(d => (
                <Link key={d.id}
                  to="/carrier/edo/$id" params={{ id: d.id }}
                  className="block rounded-md border p-3 text-sm hover:bg-muted/40 transition"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{d.doc_number ?? `ЭТрН ${d.id.slice(0, 8)}`}</span>
                      <Badge variant={edoDocStatusVariant(d.status)}>{EDO_DOC_STATUS_LABEL[d.status]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString("ru-RU")}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {d.route_summary ?? "—"}
                    {d.shipper_name ? ` · от ${d.shipper_name}` : ""}
                    {d.consignee_name ? ` → ${d.consignee_name}` : ""}
                  </div>
                  {d.awaiting_role && (
                    <div className="mt-1 text-xs text-amber-700">{edoAwaitingLabel(d.awaiting_role)}</div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectionDialog({ conn, onSaved }: { conn: ConnectionDTO | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<EdoProvider>(conn?.provider ?? "internal_mock");
  const [environment, setEnvironment] = useState<"test" | "production">(conn?.environment ?? "test");
  const [orgName, setOrgName] = useState(conn?.organization_name ?? "");
  const [orgInn, setOrgInn] = useState(conn?.organization_inn ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [comment, setComment] = useState("");

  const save = useMutation({
    mutationFn: () => apiPost("/api/carrier/edo/connection", {
      provider, environment,
      organization_name: orgName || null,
      organization_inn: orgInn || null,
      api_key: apiKey || undefined,
      client_id: clientId || undefined,
      client_secret: clientSecret || undefined,
      comment: comment || null,
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
        <Button size="sm" variant="outline">
          <Settings2 className="h-4 w-4 mr-1.5" />
          {conn ? "Изменить" : "Настроить"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Оператор ЭДО / ЭТрН</DialogTitle></DialogHeader>
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
                Вы сможете подключить оператора ЭДО позже. Пока документы будут вестись во внутреннем режиме Радиус Трек.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Среда</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as "test" | "production")}>
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
                  placeholder={conn ? "•••••• сохранено (оставьте пустым)" : ""}
                  type="password" autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Client ID</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)}
                    placeholder={conn ? "•••••• сохранено" : ""} autoComplete="off" />
                </div>
                <div>
                  <Label>Client secret</Label>
                  <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={conn ? "•••••• сохранено" : ""} type="password" autoComplete="off" />
                </div>
              </div>
            </>
          )}
          <div>
            <Label>Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDocDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [shipper, setShipper] = useState("");
  const [consignee, setConsignee] = useState("");
  const [route, setRoute] = useState("");
  const [cargo, setCargo] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");

  const create = useMutation({
    mutationFn: () => apiPost<{ id: string }>("/api/carrier/edo/documents", {
      shipper_name: shipper || null,
      consignee_name: consignee || null,
      route_summary: route || null,
      cargo_summary: cargo || null,
      vehicle_label: vehicle || null,
      driver_label: driver || null,
    }),
    onSuccess: () => {
      toast.success("Документ создан");
      setShipper(""); setConsignee(""); setRoute(""); setCargo(""); setVehicle(""); setDriver("");
      setOpen(false); onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Создать ЭТрН</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новая ЭТрН</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Грузоотправитель</Label><Input value={shipper} onChange={e => setShipper(e.target.value)} /></div>
            <div><Label>Грузополучатель</Label><Input value={consignee} onChange={e => setConsignee(e.target.value)} /></div>
          </div>
          <div><Label>Маршрут</Label><Input value={route} onChange={e => setRoute(e.target.value)} placeholder="Москва → Казань" /></div>
          <div><Label>Груз</Label><Input value={cargo} onChange={e => setCargo(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Машина</Label><Input value={vehicle} onChange={e => setVehicle(e.target.value)} /></div>
            <div><Label>Водитель</Label><Input value={driver} onChange={e => setDriver(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

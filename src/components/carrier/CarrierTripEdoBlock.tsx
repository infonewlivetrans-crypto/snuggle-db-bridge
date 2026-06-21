// Блок "Электронные документы" в карточке рейса/сделки перевозчика.
// Показывает связанные с рейсом ЭДО-документы и позволяет создать ЭТрН.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
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
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import { FileSignature, Plus, Loader2, ExternalLink } from "lucide-react";
import {
  EDO_DOC_STATUS_LABEL, edoDocStatusVariant,
  type EdoDocStatus,
} from "@/lib/edo/constants";

type DealLite = {
  id: string;
  deal_number: string | null;
  route_from: string | null;
  route_to: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  total_rate: number | string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  source_request_number: string | null;
};

type EdoDoc = {
  id: string;
  document_type: string | null;
  direction: string | null;
  status: EdoDocStatus;
  title: string | null;
  shipper_name: string | null;
  consignee_name: string | null;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

type ConnectionSafe = {
  id: string;
  provider: string;
  provider_title: string | null;
  status: string;
  is_default: boolean;
  organization_name: string | null;
};

type CpRow = {
  id: string;
  name: string;
  company_name: string | null;
  inn: string | null;
  role: "shipper" | "consignee" | "both";
};

interface Props {
  deal: DealLite;
}

export function CarrierTripEdoBlock({ deal }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const docsQ = useQuery({
    queryKey: ["carrier", "edo", "by-deal", deal.id],
    queryFn: () =>
      apiGetAuth<{ rows: EdoDoc[] }>(
        `/api/carrier/edo/documents?deal_id=${encodeURIComponent(deal.id)}`,
      ),
  });

  const docs = docsQ.data?.rows ?? [];

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileSignature className="h-4 w-4 text-muted-foreground" />
            Электронные документы (ЭДО)
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Создать ЭТрН
          </Button>
        </div>

        {docsQ.isLoading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
          </div>
        ) : docs.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Пока нет ЭДО-документов по этому рейсу.
          </div>
        ) : (
          <div className="space-y-1.5">
            {docs.map(d => (
              <Link
                key={d.id}
                to="/carrier/edo/$id"
                params={{ id: d.id }}
                className="block rounded-md border bg-background p-2 hover:bg-muted/40 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {d.document_type === "etrn" ? "ЭТрН" : (d.document_type ?? "Документ")}
                    </Badge>
                    <Badge variant={edoDocStatusVariant(d.status)}>
                      {EDO_DOC_STATUS_LABEL[d.status] ?? d.status}
                    </Badge>
                    <Badge variant="outline">Создан из рейса</Badge>
                    <span className="font-medium">
                      {d.title ?? "ЭТрН"}
                    </span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {d.shipper_name ?? "—"} → {d.consignee_name ?? "—"}
                  {" · "}
                  {new Date(d.created_at).toLocaleString("ru-RU")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>

      {open && (
        <CreateEtrnDialog
          open={open}
          onOpenChange={setOpen}
          deal={deal}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["carrier", "edo", "by-deal", deal.id] });
          }}
        />
      )}
    </Card>
  );
}

interface CreateProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal: DealLite;
  onCreated: () => void;
}

function CreateEtrnDialog({ open, onOpenChange, deal, onCreated }: CreateProps) {
  const connQ = useQuery({
    queryKey: ["carrier", "edo", "connections"],
    queryFn: () =>
      apiGetAuth<{ rows: ConnectionSafe[] }>(`/api/carrier/edo/connection`),
    enabled: open,
  });
  const cpQ = useQuery({
    queryKey: ["carrier", "edo", "counterparties", "all"],
    queryFn: () =>
      apiGetAuth<{ rows: CpRow[] }>(`/api/carrier/edo/counterparties`),
    enabled: open,
  });

  const connections = connQ.data?.rows ?? [];
  const cps = cpQ.data?.rows ?? [];
  const shippers = useMemo(
    () => cps.filter(c => c.role === "shipper" || c.role === "both"),
    [cps],
  );
  const consignees = useMemo(
    () => cps.filter(c => c.role === "consignee" || c.role === "both"),
    [cps],
  );
  const defaultConn = connections.find(c => c.is_default) ?? connections[0];

  const [connectionId, setConnectionId] = useState<string>("");
  const [shipperId, setShipperId] = useState<string>("");
  const [consigneeId, setConsigneeId] = useState<string>("");
  const [title, setTitle] = useState<string>(
    `ЭТрН по рейсу ${deal.deal_number ?? deal.source_request_number ?? deal.id.slice(0, 8)}`,
  );
  const [comment, setComment] = useState("");

  if (open && !connectionId && defaultConn) setConnectionId(defaultConn.id);

  const create = useMutation({
    mutationFn: async () => {
      const shipper = shippers.find(c => c.id === shipperId) ?? null;
      const consignee = consignees.find(c => c.id === consigneeId) ?? null;
      const body = {
        document_type: "etrn",
        direction: "outgoing",
        title,
        comment,
        connection_id: connectionId || null,
        shipper_name: shipper?.company_name ?? shipper?.name ?? null,
        shipper_inn: shipper?.inn ?? null,
        consignee_name: consignee?.company_name ?? consignee?.name ?? null,
        consignee_inn: consignee?.inn ?? null,
        loading_city: deal.route_from ?? null,
        unloading_city: deal.route_to ?? null,
        route_summary:
          [deal.route_from, deal.route_to].filter(Boolean).join(" → ") || null,
        vehicle_label: deal.vehicle_plate ?? null,
        driver_label: deal.driver_name ?? null,
        rate_amount: typeof deal.total_rate === "number" ? deal.total_rate : null,
        meta: {
          created_from_route: true,
          deal_id: deal.id,
          route_id: deal.id,
          route_number: deal.deal_number ?? deal.source_request_number ?? null,
          shipper_id: shipperId || null,
          consignee_id: consigneeId || null,
        },
      };
      return apiPost<{ id: string }>(`/api/carrier/edo/documents`, body);
    },
    onSuccess: () => {
      toast.success("ЭТрН создан");
      onCreated();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось создать ЭТрН"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создание ЭТрН из рейса</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Оператор отправки</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder={
                  connQ.isLoading ? "Загрузка…" :
                  connections.length === 0 ? "Подключений нет — будет внутренний режим" :
                  "Выберите оператора"
                } />
              </SelectTrigger>
              <SelectContent>
                {connections.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.provider_title ?? c.provider}
                    {c.is_default ? " (основное)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Грузоотправитель</Label>
            <Select value={shipperId} onValueChange={setShipperId}>
              <SelectTrigger>
                <SelectValue placeholder={
                  cpQ.isLoading ? "Загрузка…" :
                  shippers.length === 0 ? "Нет контрагентов с ролью отправителя" :
                  "Выберите из справочника"
                } />
              </SelectTrigger>
              <SelectContent>
                {shippers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company_name ?? c.name}{c.inn ? ` · ${c.inn}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Грузополучатель</Label>
            <Select value={consigneeId} onValueChange={setConsigneeId}>
              <SelectTrigger>
                <SelectValue placeholder={
                  cpQ.isLoading ? "Загрузка…" :
                  consignees.length === 0 ? "Нет контрагентов с ролью получателя" :
                  "Выберите из справочника"
                } />
              </SelectTrigger>
              <SelectContent>
                {consignees.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company_name ?? c.name}{c.inn ? ` · ${c.inn}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Название документа</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label>Комментарий</Label>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>

          <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
            Маршрут: {(deal.route_from ?? "—") + " → " + (deal.route_to ?? "—")}
            <br />
            Водитель: {deal.driver_name ?? "—"}
            {deal.vehicle_plate ? ` · ${deal.vehicle_plate}` : ""}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !shipperId || !consigneeId || !title.trim()}
          >
            {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Создать ЭТрН
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// /dispatcher/inbound-documents/:id — экран проверки входящей заявки.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, ExternalLink, Save, RefreshCw, Ban, Truck } from "lucide-react";
import { toast } from "sonner";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPatch, apiPost } from "@/lib/api-client";
import { InboundSignatureBlock } from "@/components/signatures/InboundSignatureBlock";
import { useDocumentSignatureEnabled } from "@/lib/mvp-features";

export const Route = createFileRoute("/dispatcher/inbound-documents/$id")({
  head: () => ({ meta: [{ title: "Проверка входящей заявки — AI Диспетчер" }] }),
  component: InboundDocumentReviewPage,
});

interface Fields {
  loading_city: string | null;
  loading_address: string | null;
  loading_date: string | null;
  unloading_city: string | null;
  unloading_address: string | null;
  unloading_date: string | null;
  cargo_name: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  packages_count: number | null;
  package_kind: string | null;
  rate: number | null;
  rate_vat: string | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  customer_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  comment: string | null;
}

interface Row {
  id: string;
  carrier_ext_id: string;
  email_from: string | null;
  email_subject: string | null;
  email_date: string | null;
  attachment_filename: string | null;
  attachment_mime_type: string | null;
  document_kind: string | null;
  processing_status: string;
  parse_confidence: number | null;
  parse_warnings: string[] | null;
  parsed_payload: { fields?: Partial<Fields>; missing?: string[] } | null;
  extracted_text: string | null;
  dispatcher_trip_id: string | null;
  dispatcher_deal_id: string | null;
  dispatcher_freight_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
}

interface DocResp {
  row: Row;
  signedUrl: string | null;
}

interface DriverItem {
  id: string;
  full_name: string;
  dispatcher_carrier_ext_id: string | null;
}
interface VehicleItem {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  dispatcher_driver_ext_id: string | null;
  dispatcher_carrier_ext_id: string | null;
}

const EMPTY: Fields = {
  loading_city: null,
  loading_address: null,
  loading_date: null,
  unloading_city: null,
  unloading_address: null,
  unloading_date: null,
  cargo_name: null,
  weight_kg: null,
  volume_m3: null,
  packages_count: null,
  package_kind: null,
  rate: null,
  rate_vat: null,
  payment_type: null,
  payment_delay_days: null,
  customer_name: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  comment: null,
};

function InboundDocumentReviewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dispatcher", "inbound-document", id],
    queryFn: () => apiGetAuth<DocResp>(`/api/dispatcher/inbound-documents/${id}`, 15000),
  });

  const drivers = useQuery({
    queryKey: ["dispatcher", "drivers-light"],
    queryFn: () => apiGetAuth<{ rows: DriverItem[] }>("/api/dispatcher/drivers?limit=500", 15000),
    staleTime: 60_000,
  });
  const vehicles = useQuery({
    queryKey: ["dispatcher", "vehicles-light"],
    queryFn: () => apiGetAuth<{ rows: VehicleItem[] }>("/api/dispatcher/vehicles?limit=500", 15000),
    staleTime: 60_000,
  });

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [driverId, setDriverId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");

  useEffect(() => {
    if (data?.row?.parsed_payload?.fields) {
      setFields({ ...EMPTY, ...(data.row.parsed_payload.fields as Partial<Fields>) });
    }
  }, [data?.row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredVehicles = useMemo(() => {
    const carrier = data?.row?.carrier_ext_id;
    return (vehicles.data?.rows ?? []).filter(
      (v) => !carrier || v.dispatcher_carrier_ext_id === carrier,
    );
  }, [vehicles.data, data?.row?.carrier_ext_id]);
  const filteredDrivers = useMemo(() => {
    const carrier = data?.row?.carrier_ext_id;
    return (drivers.data?.rows ?? []).filter(
      (d) => !carrier || d.dispatcher_carrier_ext_id === carrier,
    );
  }, [drivers.data, data?.row?.carrier_ext_id]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/dispatcher/inbound-documents/${id}`, {
        parsed_payload: { ...(data?.row?.parsed_payload ?? {}), fields },
      }),
    onSuccess: () => {
      toast.success("Изменения сохранены");
      qc.invalidateQueries({ queryKey: ["dispatcher", "inbound-document", id] });
    },
    onError: () => toast.error("Не удалось сохранить"),
  });

  const reparseMut = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/inbound-documents/${id}/parse`, {}, 60_000),
    onSuccess: () => {
      toast.success("Документ разобран заново");
      qc.invalidateQueries({ queryKey: ["dispatcher", "inbound-document", id] });
    },
    onError: () => toast.error("Не удалось разобрать"),
  });

  const ignoreMut = useMutation({
    mutationFn: () => apiPost(`/api/dispatcher/inbound-documents/${id}/ignore`, {}),
    onSuccess: () => {
      toast.success("Помечено как игнор");
      navigate({ to: "/dispatcher/inbound-documents" });
    },
    onError: () => toast.error("Не удалось обновить"),
  });

  const createTripMut = useMutation({
    mutationFn: () => {
      const points: Array<Record<string, unknown>> = [];
      if (fields.loading_city || fields.loading_address) {
        points.push({
          kind: "pickup",
          city: fields.loading_city,
          address: fields.loading_address,
          scheduled_at: fields.loading_date,
          contact_name: fields.contact_name,
          contact_phone: fields.contact_phone,
        });
      }
      if (fields.unloading_city || fields.unloading_address) {
        points.push({
          kind: "dropoff",
          city: fields.unloading_city,
          address: fields.unloading_address,
          scheduled_at: fields.unloading_date,
        });
      }
      return apiPost<{ ok: boolean; trip_id: string }>(
        `/api/dispatcher/inbound-documents/${id}/create-trip`,
        {
          vehicle_ext_id: vehicleId,
          driver_ext_id: driverId,
          cargo_summary: fields.cargo_name,
          weight_kg: fields.weight_kg,
          volume_m3: fields.volume_m3,
          rate: fields.rate,
          comment: fields.comment,
          points,
        },
      );
    },
    onSuccess: (r) => {
      toast.success("Задание водителю создано", {
        action: { label: "Открыть рейс", onClick: () => navigate({ to: "/dispatcher/deals" }) },
      });
      qc.invalidateQueries({ queryKey: ["dispatcher", "inbound-document", id] });
      void r;
    },
    onError: (e: unknown) =>
      toast.error("Не удалось создать рейс", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  if (isLoading || !data) {
    return (
      <DispatcherShell>
        <div className="flex items-center justify-center p-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      </DispatcherShell>
    );
  }

  const row = data.row;
  const warnings: string[] = [];
  if (!fields.loading_city && !fields.loading_address) warnings.push("Не найден адрес загрузки");
  if (!fields.unloading_city && !fields.unloading_address) warnings.push("Не найден адрес выгрузки");
  if (!fields.loading_date) warnings.push("Не найдена дата загрузки");
  if (!driverId) warnings.push("Не выбран водитель");
  if (!vehicleId) warnings.push("Не выбрана машина");

  return (
    <DispatcherShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dispatcher/inbound-documents">
              <ArrowLeft className="mr-1 h-4 w-4" /> К списку
            </Link>
          </Button>
          <Badge variant="outline">{row.processing_status}</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* LEFT */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Письмо и вложение</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Info k="От" v={row.email_from} />
              <Info k="Тема" v={row.email_subject} />
              <Info
                k="Дата"
                v={row.email_date ? new Date(row.email_date).toLocaleString("ru-RU") : null}
              />
              <Info k="Файл" v={row.attachment_filename} />
              <Info k="Тип документа" v={row.document_kind} />
              {data.signedUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={data.signedUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> Открыть вложение
                  </a>
                </Button>
              )}
              {(row.parse_warnings ?? []).length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <div className="font-medium">Предупреждения парсера:</div>
                  <ul className="list-inside list-disc">
                    {(row.parse_warnings ?? []).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {row.extracted_text && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Извлечённый текст
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2">
                    {row.extracted_text}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>

          {/* RIGHT */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Распознанные данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {warnings.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <ul className="list-inside list-disc">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <F label="Заказчик" v={fields.customer_name} on={(v) => setFields({ ...fields, customer_name: v })} />
                <F label="Контакт" v={fields.contact_name} on={(v) => setFields({ ...fields, contact_name: v })} />
                <F label="Телефон" v={fields.contact_phone} on={(v) => setFields({ ...fields, contact_phone: v })} />
                <F label="Email" v={fields.contact_email} on={(v) => setFields({ ...fields, contact_email: v })} />

                <F label="Город загрузки" v={fields.loading_city} on={(v) => setFields({ ...fields, loading_city: v })} />
                <F label="Адрес загрузки" v={fields.loading_address} on={(v) => setFields({ ...fields, loading_address: v })} />
                <F label="Дата/время загрузки" v={fields.loading_date} on={(v) => setFields({ ...fields, loading_date: v })} />

                <F label="Город выгрузки" v={fields.unloading_city} on={(v) => setFields({ ...fields, unloading_city: v })} />
                <F label="Адрес выгрузки" v={fields.unloading_address} on={(v) => setFields({ ...fields, unloading_address: v })} />
                <F label="Дата/время выгрузки" v={fields.unloading_date} on={(v) => setFields({ ...fields, unloading_date: v })} />

                <F label="Груз" v={fields.cargo_name} on={(v) => setFields({ ...fields, cargo_name: v })} />
                <F label="Вес, кг" v={fields.weight_kg?.toString() ?? null} on={(v) => setFields({ ...fields, weight_kg: v ? Number(v) : null })} />
                <F label="Объём, м³" v={fields.volume_m3?.toString() ?? null} on={(v) => setFields({ ...fields, volume_m3: v ? Number(v) : null })} />
                <F label="Места/паллеты" v={fields.packages_count?.toString() ?? null} on={(v) => setFields({ ...fields, packages_count: v ? Number(v) : null })} />
                <F label="Ставка" v={fields.rate?.toString() ?? null} on={(v) => setFields({ ...fields, rate: v ? Number(v) : null })} />
                <F label="НДС/без НДС" v={fields.rate_vat} on={(v) => setFields({ ...fields, rate_vat: v })} />
                <F label="Оплата" v={fields.payment_type} on={(v) => setFields({ ...fields, payment_type: v })} />
                <F label="Отсрочка, дней" v={fields.payment_delay_days?.toString() ?? null} on={(v) => setFields({ ...fields, payment_delay_days: v ? Number(v) : null })} />
              </div>

              <div>
                <Label className="text-xs">Примечания / особые условия</Label>
                <Textarea
                  value={fields.comment ?? ""}
                  onChange={(e) => setFields({ ...fields, comment: e.target.value || null })}
                  rows={3}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Водитель</Label>
                  <Select value={driverId} onValueChange={setDriverId}>
                    <SelectTrigger><SelectValue placeholder="Выберите водителя" /></SelectTrigger>
                    <SelectContent>
                      {filteredDrivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Машина</Label>
                  <Select value={vehicleId} onValueChange={setVehicleId}>
                    <SelectTrigger><SelectValue placeholder="Выберите машину" /></SelectTrigger>
                    <SelectContent>
                      {filteredVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {[v.vehicle_kind, v.body_type].filter(Boolean).join(" · ") || v.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Сохранить изменения
                </Button>
                <Button variant="outline" onClick={() => reparseMut.mutate()} disabled={reparseMut.isPending}>
                  {reparseMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                  Разобрать заново
                </Button>
                <Button
                  variant="default"
                  onClick={() => createTripMut.mutate()}
                  disabled={createTripMut.isPending || !driverId || !vehicleId || !!row.dispatcher_trip_id}
                >
                  {createTripMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Truck className="mr-1 h-4 w-4" />}
                  Создать задание водителю
                </Button>
                <Button variant="ghost" onClick={() => ignoreMut.mutate()} disabled={ignoreMut.isPending}>
                  <Ban className="mr-1 h-4 w-4" /> Игнорировать
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <InboundSignatureBlock
          inboundDocumentId={row.id}
          carrierExtId={row.carrier_ext_id}
          tripId={row.dispatcher_trip_id}
        />
      </div>
    </DispatcherShell>
  );
}

function Info({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v && v.length > 0 ? v : "—"}</span>
    </div>
  );
}

function F({ label, v, on }: { label: string; v: string | null; on: (v: string | null) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={v ?? ""} onChange={(e) => on(e.target.value || null)} />
    </div>
  );
}

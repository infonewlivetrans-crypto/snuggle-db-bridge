import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGetAuth, apiPatch, fetchListViaApi } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CarrierFormDialog } from "@/components/CarrierFormDialog";
import { DriverFormDialog } from "@/components/DriverFormDialog";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import {
  CARRIER_TYPE_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_ORDER,
  VERIFICATION_STYLES,
  BODY_TYPE_LABELS,
  type Carrier,
  type CarrierVerificationStatus,
  type Driver,
  type Vehicle,
} from "@/lib/carriers";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Plus,
  User,
  Truck,
  Phone,
  Mail,
  MapPin,
  Building2,
  Banknote,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/carriers/$carrierId")({
  head: () => ({ meta: [{ title: "Перевозчик — Радиус Трек" }] }),
  component: CarrierDetailPage,
});

function CarrierDetailPage() {
  const { carrierId } = Route.useParams();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [driverOpen, setDriverOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [verifComment, setVerifComment] = useState("");

  const { data: carrier, isLoading } = useQuery({
    queryKey: ["carrier", carrierId],
    queryFn: (): Promise<Carrier | null> => apiGetAuth<Carrier | null>(`/api/carriers/${carrierId}`),
  });

  const { data: drivers } = useQuery({
    queryKey: ["drivers", carrierId],
    queryFn: async (): Promise<Driver[]> => {
      const { rows } = await fetchListViaApi<Driver>("/api/drivers", {
        limit: 100,
        extra: { carrierId },
      });
      return rows;
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", carrierId],
    queryFn: async (): Promise<Vehicle[]> => {
      const { rows } = await fetchListViaApi<Vehicle>("/api/vehicles", {
        limit: 100,
        extra: { carrierId },
      });
      return rows;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: CarrierVerificationStatus) => {
      await apiPatch(`/api/carriers/${carrierId}`, {
        verification_status: status,
        verification_comment: verifComment.trim() || carrier?.verification_comment || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carrier", carrierId] });
      qc.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Статус проверки обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-5xl px-4 py-12 text-center text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  if (!carrier) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h2 className="text-xl font-semibold">Перевозчик не найден</h2>
          <Link to="/carriers" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← К списку
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/carriers"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Все перевозчики
        </Link>

        {/* Шапка */}
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {CARRIER_TYPE_LABELS[carrier.carrier_type]}
              </div>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{carrier.company_name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-foreground">
                {carrier.inn && (
                  <span>
                    <span className="text-muted-foreground">ИНН:</span>{" "}
                    <span className="font-mono">{carrier.inn}</span>
                  </span>
                )}
                {carrier.ogrn && (
                  <span>
                    <span className="text-muted-foreground">
                      {carrier.carrier_type === "ooo" ? "ОГРН:" : "ОГРНИП:"}
                    </span>{" "}
                    <span className="font-mono">{carrier.ogrn}</span>
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-foreground">
                {carrier.city && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {carrier.city}
                  </span>
                )}
                {carrier.phone && (
                  <a href={`tel:${carrier.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {carrier.phone}
                  </a>
                )}
                {carrier.email && (
                  <a href={`mailto:${carrier.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {carrier.email}
                  </a>
                )}
                {carrier.contact_person && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {carrier.contact_person}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className={VERIFICATION_STYLES[carrier.verification_status]}>
                {VERIFICATION_LABELS[carrier.verification_status]}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Редактировать
              </Button>
            </div>
          </div>
        </div>

        {/* Реквизиты */}
        {(carrier.bank_name || carrier.bank_account || carrier.bank_bik) && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Banknote className="h-3.5 w-3.5" />
              Банковские реквизиты
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {carrier.bank_name && (
                <div>
                  <div className="text-xs text-muted-foreground">Банк</div>
                  <div className="font-medium">{carrier.bank_name}</div>
                </div>
              )}
              {carrier.bank_account && (
                <div>
                  <div className="text-xs text-muted-foreground">Расчётный счёт</div>
                  <div className="font-mono">{carrier.bank_account}</div>
                </div>
              )}
              {carrier.bank_bik && (
                <div>
                  <div className="text-xs text-muted-foreground">БИК</div>
                  <div className="font-mono">{carrier.bank_bik}</div>
                </div>
              )}
              {carrier.bank_corr_account && (
                <div>
                  <div className="text-xs text-muted-foreground">Корр. счёт</div>
                  <div className="font-mono">{carrier.bank_corr_account}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Проверка */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Проверка перевозчика</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="vc">Комментарий проверяющего</Label>
              <Textarea
                id="vc"
                value={verifComment}
                onChange={(e) => setVerifComment(e.target.value)}
                placeholder={carrier.verification_comment ?? "Например: документы подтверждены"}
                className="mt-1.5"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-2 sm:w-56">
              <Select
                value={carrier.verification_status}
                onValueChange={(v) => updateStatus.mutate(v as CarrierVerificationStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERIFICATION_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {VERIFICATION_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => updateStatus.mutate("approved")}
                >
                  <CheckCircle2 className="h-4 w-4 text-status-success" />
                  Подтвердить
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => updateStatus.mutate("rejected")}
                >
                  <XCircle className="h-4 w-4 text-destructive" />
                  Отклонить
                </Button>
              </div>
            </div>
          </div>
          {carrier.verification_comment && (
            <div className="mt-3 rounded-md bg-secondary p-3 text-sm text-foreground">
              {carrier.verification_comment}
            </div>
          )}
        </div>

        {/* Водители */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Водители <span className="text-sm font-normal text-muted-foreground">· {drivers?.length ?? 0}</span>
            </h2>
            <Button size="sm" onClick={() => setDriverOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Водитель
            </Button>
          </div>
          {(drivers?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center text-sm text-muted-foreground">
              Нет водителей
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {drivers!.map((d) => (
                <div key={d.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                  {d.photo_url ? (
                    <img src={d.photo_url} alt={d.full_name} className="h-14 w-14 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-md bg-secondary">
                      <User className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold text-foreground">{d.full_name}</div>
                      {!d.is_active && (
                        <Badge variant="outline" className="border-border bg-secondary text-[10px] text-muted-foreground">
                          Неактивен
                        </Badge>
                      )}
                    </div>
                    {d.phone && <div className="text-xs text-muted-foreground">{d.phone}</div>}
                    {d.license_number && (
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        ВУ: {d.license_number}
                        {d.license_categories && ` · ${d.license_categories}`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Автомобили */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Автомобили <span className="text-sm font-normal text-muted-foreground">· {vehicles?.length ?? 0}</span>
            </h2>
            <Button size="sm" onClick={() => setVehicleOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Автомобиль
            </Button>
          </div>
          {(vehicles?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center text-sm text-muted-foreground">
              Нет автомобилей
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {vehicles!.map((v) => (
                <Link
                  key={v.id}
                  to="/vehicles/$vehicleId"
                  params={{ vehicleId: v.id }}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  {v.photo_front_url ? (
                    <img src={v.photo_front_url} alt={v.plate_number} className="h-16 w-24 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-16 w-24 items-center justify-center rounded-md bg-secondary">
                      <Truck className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-sm font-bold">
                        {v.plate_number}
                      </span>
                      {!v.is_active && (
                        <Badge variant="outline" className="border-border bg-secondary text-[10px] text-muted-foreground">
                          Неактивен
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-foreground">
                      {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {BODY_TYPE_LABELS[v.body_type]}
                      {v.capacity_kg !== null && ` · ${v.capacity_kg} кг`}
                      {v.volume_m3 !== null && ` · ${v.volume_m3} м³`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <CarrierFormDialog open={editOpen} onOpenChange={setEditOpen} carrier={carrier} />
      <DriverFormDialog open={driverOpen} onOpenChange={setDriverOpen} defaultCarrierId={carrier.id} />
      <VehicleFormDialog open={vehicleOpen} onOpenChange={setVehicleOpen} defaultCarrierId={carrier.id} />
    </div>
  );
}

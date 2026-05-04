import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGetAuth } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BODY_TYPE_LABELS, type Carrier, type Vehicle } from "@/lib/carriers";
import { ArrowLeft, Pencil, Truck, Building2 } from "lucide-react";

export const Route = createFileRoute("/vehicles/$vehicleId")({
  head: () => ({ meta: [{ title: "Автомобиль — Радиус Трек" }] }),
  component: VehicleDetailPage,
});

function VehicleDetailPage() {
  const { vehicleId } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: (): Promise<Vehicle | null> => apiGetAuth<Vehicle | null>(`/api/vehicles/${vehicleId}`),
  });

  const { data: carrier } = useQuery({
    queryKey: ["carrier", vehicle?.carrier_id],
    enabled: !!vehicle?.carrier_id,
    queryFn: (): Promise<Carrier | null> =>
      apiGetAuth<Carrier | null>(`/api/carriers/${vehicle!.carrier_id}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-5xl px-4 py-12 text-center text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h2 className="text-xl font-semibold">Автомобиль не найден</h2>
          <Link to="/vehicles" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← К списку
          </Link>
        </div>
      </div>
    );
  }

  const photos: { label: string; url: string | null }[] = [
    { label: "Спереди", url: vehicle.photo_front_url },
    { label: "Сзади", url: vehicle.photo_back_url },
    { label: "Слева", url: vehicle.photo_left_url },
    { label: "Справа", url: vehicle.photo_right_url },
    { label: "Кузов внутри", url: vehicle.photo_inside_url },
    { label: "Документы", url: vehicle.photo_documents_url },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/vehicles"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Все автомобили
        </Link>

        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-secondary px-3 py-1 font-mono text-lg font-bold text-foreground">
                  {vehicle.plate_number}
                </span>
                <Badge variant="outline" className="border-border bg-secondary">
                  {BODY_TYPE_LABELS[vehicle.body_type]}
                </Badge>
                {!vehicle.is_active && (
                  <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                    Неактивен
                  </Badge>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-bold text-foreground">
                {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"}
              </h1>
              {carrier && (
                <Link
                  to="/carriers/$carrierId"
                  params={{ carrierId: carrier.id }}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                >
                  <Building2 className="h-4 w-4" />
                  {carrier.company_name}
                </Link>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Редактировать
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Грузоп., кг" value={vehicle.capacity_kg ?? "—"} />
            <Stat label="Объём, м³" value={vehicle.volume_m3 ?? "—"} />
            <Stat label="Габариты, м" value={
              vehicle.body_length_m !== null
                ? `${vehicle.body_length_m}×${vehicle.body_width_m ?? "?"}×${vehicle.body_height_m ?? "?"}`
                : "—"
            } />
            <Stat label="Колец" value={vehicle.tie_rings_count} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {vehicle.has_straps && <Tag>🪢 Ремни / крепления</Tag>}
            {vehicle.has_tent && <Tag>⛺ Тент</Tag>}
            {vehicle.has_manipulator && <Tag>🏗 Манипулятор</Tag>}
          </div>

          {vehicle.comment && (
            <div className="mt-4 rounded-md bg-secondary p-3 text-sm text-foreground">{vehicle.comment}</div>
          )}
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Фото автомобиля</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <div key={p.label} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {p.label}
                </div>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <img src={p.url} alt={p.label} loading="lazy" className="h-40 w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                    <Truck className="mr-2 h-5 w-5" />
                    Нет фото
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      <VehicleFormDialog open={editOpen} onOpenChange={setEditOpen} vehicle={vehicle} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 font-medium text-foreground">
      {children}
    </span>
  );
}

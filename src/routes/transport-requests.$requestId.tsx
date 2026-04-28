import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Hash, MessageSquare, Warehouse, Calendar, Tag } from "lucide-react";
import {
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
} from "./transport-requests.index";
import { RequestOrdersBlock } from "@/components/RequestOrdersBlock";
import { RequestTotalsCards } from "@/components/RequestTotalsCards";
import { RequestWarehousesEditor } from "@/components/RequestWarehousesEditor";
import { TransportRequirementsBlock } from "@/components/TransportRequirementsBlock";
import { TransportCapacityCheck } from "@/components/TransportCapacityCheck";
import type { BodyType } from "@/lib/carriers";

export const Route = createFileRoute("/transport-requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Заявка на транспорт — Радиус Трек" },
      { name: "description", content: "Карточка заявки на транспорт" },
    ],
  }),
  component: TransportRequestDetailPage,
});

type RequestDetail = {
  id: string;
  route_number: string;
  request_type: string;
  status: string;
  route_date: string;
  comment: string | null;
  warehouse_id: string | null;
  destination_warehouse_id: string | null;
  points_count: number;
  total_weight_kg: number;
  total_volume_m3: number;
  source_warehouse?: { name: string; city: string | null } | null;
  destination_warehouse?: { name: string; city: string | null } | null;
  required_body_type: BodyType | null;
  required_capacity_kg: number | null;
  required_volume_m3: number | null;
  required_body_length_m: number | null;
  requires_tent: boolean;
  requires_manipulator: boolean;
  requires_straps: boolean;
  transport_comment: string | null;
};

function TransportRequestDetailPage() {
  const { requestId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["transport-request", requestId],
    queryFn: async (): Promise<RequestDetail | null> => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, route_number, request_type, status, route_date, comment, warehouse_id, destination_warehouse_id, points_count, total_weight_kg, total_volume_m3, required_body_type, required_capacity_kg, required_volume_m3, required_body_length_m, requires_tent, requires_manipulator, requires_straps, transport_comment, source_warehouse:warehouse_id(name, city), destination_warehouse:destination_warehouse_id(name, city)",
        )
        .eq("id", requestId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as RequestDetail | null;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link to="/transport-requests">
          <Button variant="ghost" size="sm" className="mb-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" />К списку заявок
          </Button>
        </Link>

        {isLoading ? (
          <div className="text-muted-foreground">Загрузка...</div>
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Заявка не найдена</p>
          </div>
        ) : (
          <div className="space-y-5 rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <Hash className="h-6 w-6 text-muted-foreground" />
                  {data.route_number}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Карточка заявки на транспорт</p>
              </div>
              <Badge variant="outline">
                {REQUEST_STATUS_LABELS[data.status] ?? data.status}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field icon={<Tag className="h-4 w-4" />} label="Тип заявки">
                {REQUEST_TYPE_LABELS[data.request_type] ?? data.request_type}
              </Field>
              <Field icon={<Calendar className="h-4 w-4" />} label="Дата отправки">
                {new Date(data.route_date).toLocaleDateString("ru-RU")}
              </Field>
            </div>

            <RequestWarehousesEditor
              requestId={data.id}
              requestType={data.request_type}
              warehouseId={data.warehouse_id}
              destinationWarehouseId={data.destination_warehouse_id}
            />


            <RequestTotalsCards requestId={data.id} />

            <TransportRequirementsBlock
              requestId={data.id}
              initial={{
                required_body_type: data.required_body_type,
                required_capacity_kg: data.required_capacity_kg,
                required_volume_m3: data.required_volume_m3,
                required_body_length_m: data.required_body_length_m,
                requires_tent: data.requires_tent,
                requires_manipulator: data.requires_manipulator,
                requires_straps: data.requires_straps,
                transport_comment: data.transport_comment,
              }}
            />

            <TransportCapacityCheck
              requestId={data.id}
              requiredCapacityKg={data.required_capacity_kg}
              requiredVolumeM3={data.required_volume_m3}
            />


            <div className="rounded-lg border border-border p-4">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Комментарий
              </div>
              <div className="text-sm text-foreground">
                {data.comment || (
                  <span className="italic text-muted-foreground">Без комментария</span>
                )}
              </div>
            </div>

            {/* Заказы в заявке */}
            <RequestOrdersBlock requestId={data.id} />
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

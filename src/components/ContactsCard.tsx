import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { cn } from "@/lib/utils";

export type ContactPerson = {
  /** Идентификатор роли (для логирования/аналитики). */
  role: "client" | "manager" | "logist" | "driver" | "carrier";
  /** Подпись роли в UI. */
  label: string;
  /** Имя контактного лица. */
  name: string | null | undefined;
  /** Телефон в любом формате (будет нормализован). */
  phone: string | null | undefined;
};

type Props = {
  contacts: ContactPerson[];
  title?: string;
  className?: string;
  onCall?: (role: ContactPerson["role"], phone: string) => void;
};

/**
 * Карточка с контактами разных ролей (клиент / менеджер / логист / водитель / перевозчик).
 * Каждая строка содержит имя, отформатированный телефон и кнопку звонка через tel:.
 */
export function ContactsCard({ contacts, title = "Контакты", className, onCall }: Props) {
  const list = contacts.filter((c) => c.name || c.phone);
  if (list.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        Контакты не указаны
      </div>
    );
  }
  return (
    <div className={cn("space-y-3 rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      <ul className="space-y-2">
        {list.map((c, i) => (
          <li
            key={`${c.role}-${i}`}
            className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {c.label}
              </div>
              <div className="truncate text-sm font-medium text-foreground">
                {c.name || <span className="italic text-muted-foreground">не указан</span>}
              </div>
            </div>
            <PhoneCallButton
              phone={c.phone}
              size="default"
              variant="outline"
              compact
              onCall={(p) => onCall?.(c.role, p)}
              className="shrink-0"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Загружает контакты по заявке/рейсу: клиент (по первой точке), менеджер клиента,
 * логист (создатель заявки), водитель, перевозчик.
 *
 * routeId — id записи в таблице routes (заявка на транспорт).
 * deliveryRouteId — id записи в delivery_routes (фактический рейс), если есть.
 */
export function useRouteContacts(params: {
  routeId?: string | null;
  deliveryRouteId?: string | null;
}) {
  const { routeId, deliveryRouteId } = params;
  return useQuery({
    enabled: !!(routeId || deliveryRouteId),
    queryKey: ["route-contacts", routeId ?? null, deliveryRouteId ?? null],
    queryFn: async (): Promise<ContactPerson[]> => {
      // 1. Заявка-источник
      let request: {
        id: string;
        driver_name: string | null;
        created_by: string | null;
      } | null = null;

      let dr: {
        assigned_driver: string | null;
        carrier_id: string | null;
        source_request_id: string;
      } | null = null;

      if (deliveryRouteId) {
        const { data } = await supabase
          .from("delivery_routes")
          .select("assigned_driver, carrier_id, source_request_id")
          .eq("id", deliveryRouteId)
          .maybeSingle();
        dr = (data as typeof dr) ?? null;
      }
      const reqId = routeId ?? dr?.source_request_id ?? null;
      if (reqId) {
        const { data } = await supabase
          .from("routes")
          .select("id, driver_name, created_by")
          .eq("id", reqId)
          .maybeSingle();
        request = (data as typeof request) ?? null;
      }

      // 2. Первая точка — берём клиента и менеджера клиента
      let clientName: string | null = null;
      let clientPhone: string | null = null;
      let managerName: string | null = null;
      let managerPhone: string | null = null;
      if (reqId) {
        const { data: pt } = await supabase
          .from("route_points")
          .select(
            "order:order_id(contact_name, contact_phone)",
          )
          .eq("route_id", reqId)
          .order("point_number", { ascending: true })
          .limit(1)
          .maybeSingle();
        const o = (pt as any)?.order as
          | { contact_name: string | null; contact_phone: string | null }
          | null
          | undefined;
        clientName = o?.contact_name ?? null;
        clientPhone = o?.contact_phone ?? null;
        if (clientName) {
          const { data: cl } = await supabase
            .from("clients")
            .select("manager_name, manager_phone")
            .eq("name", clientName)
            .maybeSingle();
          managerName = (cl as any)?.manager_name ?? null;
          managerPhone = (cl as any)?.manager_phone ?? null;
        }
      }

      // 3. Водитель
      let driverName = dr?.assigned_driver ?? request?.driver_name ?? null;
      let driverPhone: string | null = null;
      if (driverName) {
        const { data: dv } = await supabase
          .from("drivers")
          .select("phone, full_name")
          .ilike("full_name", driverName)
          .maybeSingle();
        if (dv) {
          driverPhone = (dv as any).phone ?? null;
          driverName = (dv as any).full_name ?? driverName;
        }
      }

      // 4. Перевозчик
      let carrierName: string | null = null;
      let carrierPhone: string | null = null;
      if (dr?.carrier_id) {
        const { data: cr } = await supabase
          .from("carriers")
          .select("company_name, contact_person, phone")
          .eq("id", dr.carrier_id)
          .maybeSingle();
        if (cr) {
          carrierName = (cr as any).contact_person || (cr as any).company_name || null;
          carrierPhone = (cr as any).phone ?? null;
        }
      }

      // 5. Логист — пытаемся вытащить из profiles по created_by
      let logistName: string | null = request?.created_by ?? null;
      let logistPhone: string | null = null;
      if (logistName) {
        const { data: pr } = await supabase
          .from("profiles")
          .select("display_name, phone")
          .or(`display_name.ilike.${logistName},email.ilike.${logistName}`)
          .limit(1)
          .maybeSingle();
        if (pr) {
          logistName = (pr as any).display_name ?? logistName;
          logistPhone = (pr as any).phone ?? null;
        }
      }

      return [
        { role: "client", label: "Клиент", name: clientName, phone: clientPhone },
        { role: "manager", label: "Менеджер", name: managerName, phone: managerPhone },
        { role: "logist", label: "Логист", name: logistName, phone: logistPhone },
        { role: "driver", label: "Водитель", name: driverName, phone: driverPhone },
        { role: "carrier", label: "Перевозчик", name: carrierName, phone: carrierPhone },
      ];
    },
  });
}

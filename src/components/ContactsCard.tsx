import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
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
  // Временно отключено: блок собирал контакты прямыми browser-запросами в
  // Supabase REST (delivery_routes / routes / route_points / clients / drivers /
  // carriers / profiles), которые на production отдают 400. До отдельной
  // миграции на /api/* возвращаем пустой список — карточка покажет
  // «Контакты не указаны» и не делает сетевых запросов.
  return useQuery({
    enabled: !!(routeId || deliveryRouteId),
    queryKey: ["route-contacts", routeId ?? null, deliveryRouteId ?? null],
    queryFn: async (): Promise<ContactPerson[]> => [],
  });
}

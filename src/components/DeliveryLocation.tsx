import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Navigation,
  ExternalLink,
  Phone,
  User,
  MessageSquare,
  Compass,
  Image as ImageIcon,
  Copy,
} from "lucide-react";
import {
  formatCoords,
  googleMapsUrl,
  googleNavigateUrl,
  yandexMapsUrl,
  yandexNavigatorUrl,
  dgisUrl,
  yandexStaticMapUrl,
} from "@/lib/geo";
import { toast } from "sonner";

type LocationOrder = {
  delivery_address: string | null;
  latitude: number | null;
  longitude: number | null;
  landmarks: string | null;
  access_instructions: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  map_link: string | null;
  delivery_photo_url: string | null;
};

interface DeliveryLocationProps {
  order: LocationOrder;
  /** Компактный вариант (для строки в маршруте). */
  compact?: boolean;
}

export function DeliveryLocation({ order, compact = false }: DeliveryLocationProps) {
  const hasCoords =
    typeof order.latitude === "number" && typeof order.longitude === "number";
  const lat = order.latitude ?? 0;
  const lng = order.longitude ?? 0;

  const copyCoords = async () => {
    if (!hasCoords) return;
    try {
      await navigator.clipboard.writeText(formatCoords(lat, lng));
      toast.success("Координаты скопированы");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="space-y-3">
      {/* Адрес и/или координаты */}
      <div className="rounded-lg border border-border bg-secondary/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Точка доставки
          </div>
          {!order.delivery_address && hasCoords && (
            <span className="badge-status badge-status-delivering text-[10px]">
              Без точного адреса
            </span>
          )}
        </div>

        {order.delivery_address && (
          <div className="text-sm font-medium text-foreground">{order.delivery_address}</div>
        )}

        {hasCoords && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyCoords}
              className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 font-mono text-xs text-foreground hover:bg-secondary"
              title="Скопировать координаты"
            >
              <Compass className="h-3 w-3" />
              {formatCoords(lat, lng)}
              <Copy className="h-3 w-3 opacity-60" />
            </button>
          </div>
        )}

        {!order.delivery_address && !hasCoords && (
          <div className="text-sm italic text-muted-foreground">Нет данных о местоположении</div>
        )}
      </div>

      {/* Карта-превью */}
      {hasCoords && !compact && (
        <a
          href={yandexMapsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg border border-border"
        >
          <img
            src={yandexStaticMapUrl(lat, lng, { width: 800, height: 240 })}
            alt="Карта точки доставки"
            loading="lazy"
            className="h-40 w-full object-cover"
          />
        </a>
      )}

      {/* Кнопки навигации */}
      {(hasCoords || order.map_link) && (
        <div className="flex flex-wrap gap-2">
          {hasCoords && (
            <>
              <Button asChild size="sm" className="gap-1.5">
                <a
                  href={yandexNavigatorUrl(lat, lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Я.Навигатор
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={yandexMapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
                  Я.Карты
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a
                  href={googleNavigateUrl(lat, lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Maps
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={dgisUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
                  2ГИС
                </a>
              </Button>
            </>
          )}
          {order.map_link && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={order.map_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Ссылка
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Ориентиры / проезд / контакт / фото */}
      {(order.landmarks ||
        order.access_instructions ||
        order.contact_name ||
        order.contact_phone ||
        (order.delivery_photo_url && !compact)) && (
        <div className="space-y-2">
          {order.landmarks && (
            <InfoBlock icon={<Compass className="h-3.5 w-3.5" />} label="Ориентиры">
              {order.landmarks}
            </InfoBlock>
          )}
          {order.access_instructions && (
            <InfoBlock icon={<MessageSquare className="h-3.5 w-3.5" />} label="Как проехать">
              {order.access_instructions}
            </InfoBlock>
          )}
          {(order.contact_name || order.contact_phone) && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Контакт клиента
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-foreground">
                {order.contact_name && <span>{order.contact_name}</span>}
                {order.contact_phone && (
                  <a
                    href={`tel:${order.contact_phone}`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {order.contact_phone}
                  </a>
                )}
              </div>
            </div>
          )}
          {order.delivery_photo_url && !compact && (
            <a
              href={order.delivery_photo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-border"
            >
              <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" />
                Фото места выгрузки
              </div>
              <img
                src={order.delivery_photo_url}
                alt="Место выгрузки"
                loading="lazy"
                className="max-h-64 w-full object-cover"
              />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function InfoBlock({
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
      <div className="whitespace-pre-line text-sm text-foreground">{children}</div>
    </div>
  );
}

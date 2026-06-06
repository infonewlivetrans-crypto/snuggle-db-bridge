import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

export const Route = createFileRoute("/carrier/")({
  head: () => ({ meta: [{ title: "Мои данные — кабинет перевозчика" }] }),
  component: CarrierOverviewPage,
});

type Me = {
  ok: boolean;
  reason?: string;
  profile: { full_name: string | null; email: string | null; phone: string | null } | null;
  carrier: {
    id: string;
    company_name: string;
    carrier_type: string;
    inn: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    contact_person: string | null;
    verification_status: string;
  } | null;
  ext: {
    commission_rate: number | null;
    commission_agreed: boolean;
    commission_agreed_by: string | null;
    commission_payment_method: string | null;
    verification_status: string;
    carrier_kind: string | null;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  on_check: "На проверке",
  ready_to_work: "Готов к работе",
  missing_docs: "Нет документов",
  blocked: "Заблокирован",
  archive: "Архив",
};

function CarrierOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }
  if (error || !data?.ok) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Не удалось загрузить данные перевозчика.{" "}
          {data?.reason === "no_carrier_linked"
            ? "Ваша учётная запись пока не связана с карточкой перевозчика."
            : null}
        </CardContent>
      </Card>
    );
  }

  const { carrier, ext, profile } = data;
  const commissionPct =
    ext?.commission_rate != null ? Math.round(ext.commission_rate * 10000) / 100 : 5;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Перевозчик</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Название / ФИО" v={carrier?.company_name} />
          <Row k="Тип" v={ext?.carrier_kind ?? carrier?.carrier_type} />
          <Row k="ИНН" v={carrier?.inn} />
          <Row k="Город" v={carrier?.city} />
          <Row k="Контактное лицо" v={carrier?.contact_person} />
          <Row k="Телефон" v={carrier?.phone} />
          <Row k="Email" v={carrier?.email} />
          <div className="pt-2">
            <Badge variant="outline">
              Статус проверки:{" "}
              {STATUS_LABEL[carrier?.verification_status ?? "new"] ??
                carrier?.verification_status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Комиссия Радиус Трек</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Размер комиссии" v={`${commissionPct}%`} />
          <Row
            k="Согласие"
            v={ext?.commission_agreed ? "Подтверждено" : "Не подтверждено"}
          />
          <Row k="Подтвердил" v={ext?.commission_agreed_by} />
          <Row k="Способ оплаты" v={ext?.commission_payment_method} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Учётная запись</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Email" v={profile?.email} />
          <Row k="Телефон" v={profile?.phone} />
          <Row k="ФИО / контакт" v={profile?.full_name} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v && v.length > 0 ? v : "—"}</span>
    </div>
  );
}

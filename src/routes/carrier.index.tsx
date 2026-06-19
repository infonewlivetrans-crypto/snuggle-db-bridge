import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { apiPost } from "@/lib/api-client";
import { readPendingOffer, clearPendingOffer } from "@/lib/contracts/carrier-offer";
import { CarrierDocumentsBlock } from "@/components/carrier/CarrierDocumentsBlock";
import { CarrierInboxSummary } from "@/components/carrier/CarrierInboxSummary";
import { CarrierIncomingOfferAlert } from "@/components/carrier/CarrierIncomingOfferAlert";
import { OnboardingChecklist } from "@/components/carrier/OnboardingChecklist";
import { CarrierEmailBanner } from "@/components/carrier/CarrierEmailBanner";
import { CarrierInboundDocsBlock } from "@/components/carrier/CarrierInboundDocsBlock";
import { CarrierSignatureCard } from "@/components/carrier/CarrierSignatureCard";
import { useDocumentSignatureEnabled } from "@/lib/mvp-features";

const PENDING_KEY = "rt-carrier-activate-token";

export const Route = createFileRoute("/carrier/")({
  head: () => ({ meta: [{ title: "Мои данные — кабинет перевозчика" }] }),
  component: CarrierOverviewPage,
});

type Me = {
  ok: boolean;
  reason?: string;
  error?: string;
  user_id?: string;
  profile_carrier_id?: string | null;
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
    id?: string;
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
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const signatureEnabled = useDocumentSignatureEnabled();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
    retry: false,
  });

  // Если пользователь только что подтвердил email и зашёл — попробуем
  // привязать его к карточке перевозчика через сохранённый токен.
  const claimedRef = useRef(false);
  useEffect(() => {
    if (claimedRef.current) return;
    if (data?.ok) {
      try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
      return;
    }
    const isNotLinked =
      data?.reason === "no_carrier_linked" || data?.error === "no_carrier_linked";
    if (!isNotLinked) return;
    let token: string | null = null;
    try { token = localStorage.getItem(PENDING_KEY); } catch { /* noop */ }
    if (!token) return;
    claimedRef.current = true;
    (async () => {
      try {
        const claim = await apiPost<{ ok: boolean; error?: string; reason?: string }>(
          `/api/carrier/activate/${encodeURIComponent(token)}`,
        );
        if (!claim.ok) return;
        try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
        // Обновим /api/carrier/me, чтобы получить ext.id для записи акцепта.
        await qc.invalidateQueries({ queryKey: ["carrier", "me"] });
        const fresh = await qc.fetchQuery({
          queryKey: ["carrier", "me"],
          queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
        });
        const extId = (fresh?.ext as { id?: string } | null | undefined)?.id;
        const pending = readPendingOffer();
        if (extId && pending) {
          try {
            await apiPost("/api/carrier/offer-acceptance", {
              dispatcher_carrier_ext_id: extId,
              payload: pending,
              source: pending.source ?? "carrier_activate",
            });
            clearPendingOffer();
          } catch (e) {
            console.error("[carrier.index] record_offer error", e);
          }
        }
      } catch (e) {
        console.error("[carrier.index] claim error", e);
      }
    })();
  }, [data, qc]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }
  if (error || !data?.ok) {
    const isNotLinked =
      data?.reason === "no_carrier_linked" || data?.error === "no_carrier_linked";
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center text-sm">
          <div className="flex items-center justify-center text-amber-600">
            <AlertCircle className="mr-2 h-5 w-5" />
            <span className="font-medium">
              {isNotLinked
                ? "Кабинет перевозчика ещё не активирован"
                : "Не удалось загрузить данные перевозчика"}
            </span>
          </div>
          <p className="text-muted-foreground">
            {isNotLinked
              ? "Этот пользователь ещё не связан с карточкой перевозчика. Попросите диспетчера отправить ссылку активации кабинета перевозчика (/carrier/activate/…)."
              : "Попробуйте обновить страницу или зайдите позже."}
          </p>
          {isAdmin && (data?.user_id || data?.profile_carrier_id !== undefined) && (
            <div className="mx-auto max-w-md rounded-md border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
              <div>
                <span className="font-medium">user_id:</span> {data?.user_id ?? "—"}
              </div>
              <div>
                <span className="font-medium">profile.carrier_id:</span>{" "}
                {data?.profile_carrier_id ?? "—"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const { carrier, ext, profile } = data;
  const commissionPct =
    ext?.commission_rate != null ? Math.round(ext.commission_rate * 10000) / 100 : 5;

  return (
    <div className="space-y-4">
      <OnboardingChecklist />
      <CarrierEmailBanner />
      <CarrierIncomingOfferAlert />
      <CarrierInboxSummary />
      <CarrierInboundDocsBlock />
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

      {ext?.id && (
        <>
          {signatureEnabled && <CarrierSignatureCard carrierExtId={ext.id} />}
          <div className="lg:col-span-2">
            <CarrierDocumentsBlock
              ownerType="carrier"
              ownerId={ext.id}
              title="Документы перевозчика"
            />
          </div>
        </>
      )}
      </div>
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

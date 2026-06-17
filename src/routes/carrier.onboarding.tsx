import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import {
  OnboardingChecklist,
  useOnboardingStatus,
} from "@/components/carrier/OnboardingChecklist";
import { CarrierDocumentsBlock } from "@/components/carrier/CarrierDocumentsBlock";

export const Route = createFileRoute("/carrier/onboarding")({
  head: () => ({ meta: [{ title: "Настройка перевозчика — Радиус Трек" }] }),
  component: CarrierOnboardingPage,
});

type CarrierExt = {
  id: string;
  name: string | null;
  inn: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  ati_code: string | null;
  ati_email: string | null;
  taxation_type: string | null;
  bank_name: string | null;
  bik: string | null;
  settlement_account: string | null;
  correspondent_account: string | null;
  legal_address: string | null;
  whatsapp: string | null;
  telegram: string | null;
  max_messenger: string | null;
};

type MeResp = {
  ok: boolean;
  ext: { id?: string } | null;
};

const TAX_OPTIONS = [
  { v: "osno_vat", l: "ОСНО (с НДС)" },
  { v: "usn", l: "УСН (без НДС)" },
  { v: "ip_no_vat", l: "ИП без НДС" },
  { v: "self_employed", l: "Самозанятый" },
  { v: "by_agreement", l: "По договорённости" },
];

function CarrierOnboardingPage() {
  const qc = useQueryClient();
  const statusQ = useOnboardingStatus();
  const meQ = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<MeResp>("/api/carrier/me", 10000),
    retry: false,
  });
  const extId = meQ.data?.ext?.id;

  const extQ = useQuery<CarrierExt | null>({
    queryKey: ["carrier", "ext", extId],
    enabled: !!extId,
    queryFn: async () => {
      const r = await apiGetAuth<{ ok: boolean; row: CarrierExt | null }>(
        "/api/carrier/carrier-ext",
        10000,
      );
      return r.row;
    },
  });

  const [form, setForm] = useState<Partial<CarrierExt>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (extQ.data) setForm(extQ.data);
  }, [extQ.data]);

  const status = statusQ.data;

  const saveExt = async (patch: Partial<CarrierExt>) => {
    if (!extId) return;
    setSaving(true);
    try {
      await apiPatch(`/api/carrier/carrier-ext`, patch, 15000);
      toast.success("Сохранено");
      await qc.invalidateQueries({ queryKey: ["carrier", "onboarding-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  if (meQ.isLoading || statusQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-[env(safe-area-inset-bottom)]">
      <OnboardingChecklist />

      <SectionCard
        title="1. Данные компании / контакты / ATI"
        done={status?.carrierComplete}
        hint="Название, ИНН, город и контактное лицо нужны диспетчеру для проверки и связи."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название / ФИО ИП">
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ООО «Радиус», ИП Иванов И.И."
            />
          </Field>
          <Field label="ИНН">
            <Input
              value={form.inn ?? ""}
              onChange={(e) => setForm({ ...form, inn: e.target.value })}
              inputMode="numeric"
              placeholder="10/12 цифр"
            />
          </Field>
          <Field label="Город">
            <Input
              value={form.city ?? ""}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Field>
          <Field label="Телефон">
            <Input
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+7…"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="WhatsApp">
            <Input
              value={form.whatsapp ?? ""}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
          </Field>
          <Field label="Telegram">
            <Input
              value={form.telegram ?? ""}
              onChange={(e) => setForm({ ...form, telegram: e.target.value })}
              placeholder="@username"
            />
          </Field>
          <Field label="Max Messenger">
            <Input
              value={form.max_messenger ?? ""}
              onChange={(e) =>
                setForm({ ...form, max_messenger: e.target.value })
              }
              placeholder="ник или ссылка max.ru/…"
            />
          </Field>
          <Field label="ATI код" hint="Поможет диспетчеру быстро проверить репутацию.">
            <Input
              value={form.ati_code ?? ""}
              onChange={(e) => setForm({ ...form, ati_code: e.target.value })}
            />
          </Field>
          <Field label="Email / логин ATI">
            <Input
              value={form.ati_email ?? ""}
              onChange={(e) => setForm({ ...form, ati_email: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => saveExt(form)} disabled={saving}>
            Сохранить
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="2. Налоговый режим и реквизиты"
        done={status?.requisitesComplete}
        hint="Нужны для корректной работы с оплатами и документами."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Вид налогообложения">
            <Select
              value={form.taxation_type ?? ""}
              onValueChange={(v) => setForm({ ...form, taxation_type: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите…" />
              </SelectTrigger>
              <SelectContent>
                {TAX_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={o.v}>
                    {o.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Банк">
            <Input
              value={form.bank_name ?? ""}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            />
          </Field>
          <Field label="БИК">
            <Input
              value={form.bik ?? ""}
              onChange={(e) => setForm({ ...form, bik: e.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Расчётный счёт">
            <Input
              value={form.settlement_account ?? ""}
              onChange={(e) =>
                setForm({ ...form, settlement_account: e.target.value })
              }
              inputMode="numeric"
            />
          </Field>
          <Field label="Корреспондентский счёт">
            <Input
              value={form.correspondent_account ?? ""}
              onChange={(e) =>
                setForm({ ...form, correspondent_account: e.target.value })
              }
              inputMode="numeric"
            />
          </Field>
          <Field label="Юридический адрес">
            <Input
              value={form.legal_address ?? ""}
              onChange={(e) =>
                setForm({ ...form, legal_address: e.target.value })
              }
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => saveExt(form)} disabled={saving}>
            Сохранить
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="3. Документы перевозчика"
        done={status?.documentsComplete}
        hint="Можно сделать фото с телефона или загрузить файлы."
      >
        {extId ? (
          <CarrierDocumentsBlock
            ownerType="carrier"
            ownerId={extId}
            title=""
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Сначала завершите привязку перевозчика.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="4. Водитель и его документы"
        done={status?.hasDriver && status?.driverComplete && status?.driverDocumentsComplete}
        hint="Можно добавить себя как водителя или пригласить наёмного водителя по ссылке."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/carrier/drivers">
              Перейти к водителям <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="5. Транспорт и его документы"
        done={
          status?.hasVehicle && status?.vehicleComplete && status?.vehicleDocumentsComplete
        }
        hint="Грузоподъёмность вводится в тоннах. Документы можно загрузить фото."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/carrier/vehicles">
              Перейти к транспорту <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="6. Закрепить водителя и указать местоположение"
        done={status?.hasVehicleDriverBinding && status?.hasLocation}
        hint="В карточке машины выберите водителя и текущий город. После этого машина появится на карте AI-диспетчера."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default">
            <Link to="/carrier/vehicles">
              Открыть транспорт <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SectionCard>

      <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        Один водитель может быть закреплён за несколькими машинами. В карточке
        машины выбирайте уже существующего водителя — система это разрешает.
      </div>
    </div>
  );
}

function SectionCard({
  title,
  done,
  hint,
  children,
}: {
  title: string;
  done?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
          <span>{title}</span>
        </CardTitle>
        {hint && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FREIGHT_KINDS, FREIGHT_KIND_LABELS,
  FREIGHT_STATUSES, FREIGHT_STATUS_LABELS,
  LOAD_METHODS, LOAD_METHOD_LABELS,
  PAYMENT_TYPES, PAYMENT_TYPE_LABELS,
  type FreightKind, type FreightStatus, type LoadMethod, type PaymentType,
} from "@/lib/dispatcher/statuses";
import type { FreightDTO } from "@/lib/dispatcher/types";
import type { FreightCreateInput } from "@/lib/dispatcher/schemas";
import { VehicleBodyTypeSelect } from "@/components/dispatcher/VehicleBodyTypeSelect";

interface Props {
  initial?: FreightDTO | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (data: FreightCreateInput) => void;
}

const empty = (v: string | null | undefined): string => (v == null ? "" : v);
const numStr = (n: number | null | undefined): string => (n == null ? "" : String(n));
const toNum = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function FreightForm({ initial, submitting, onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [loadingCity, setLoadingCity] = useState("");
  const [unloadingCity, setUnloadingCity] = useState("");
  const [loadingDate, setLoadingDate] = useState("");
  const [unloadingDate, setUnloadingDate] = useState("");
  const [cargoName, setCargoName] = useState("");
  const [weight, setWeight] = useState("");
  const [volume, setVolume] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [loadMethods, setLoadMethods] = useState<LoadMethod[]>([]);
  const [rate, setRate] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType | "none">(initial?.payment_type ? (initial.payment_type as PaymentType) : "none");
  const [paymentDelay, setPaymentDelay] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWa, setContactWa] = useState("");
  const [contactTg, setContactTg] = useState("");
  const [contactMx, setContactMx] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<FreightStatus>((initial?.dispatcher_status as FreightStatus) ?? "new");
  const [kind, setKind] = useState<FreightKind>(initial?.freight_kind === "additional" ? "additional" : "main");

  useEffect(() => {
    if (initial) {
      setTitle(empty(initial.title));
      setLoadingCity(empty(initial.loading_city));
      setUnloadingCity(empty(initial.unloading_city));
      setLoadingDate(empty(initial.loading_date));
      setUnloadingDate(empty(initial.unloading_date));
      setCargoName(empty(initial.cargo_name));
      setWeight(numStr(initial.weight_kg));
      setVolume(numStr(initial.volume_m3));
      setBodyType(empty(initial.body_type));
      setLoadMethods((initial.load_methods as LoadMethod[]) ?? []);
      setRate(numStr(initial.rate));
      setPaymentType(initial?.payment_type ? (initial.payment_type as PaymentType) : "none");
      setPaymentDelay(numStr(initial.payment_delay_days));
      setSource(empty(initial.source));
      setSourceUrl(empty(initial.source_url));
      setContactName(empty(initial.contact_name));
      setContactPhone(empty(initial.contact_phone));
      setContactWa(empty(initial.contact_whatsapp));
      setContactTg(empty(initial.contact_telegram));
      setContactMx(empty(initial.contact_max_messenger));
      setComment(empty(initial.comment));
      setStatus((initial?.dispatcher_status as FreightStatus) ?? "new");
      setKind(initial?.freight_kind === "additional" ? "additional" : "main");
      setStatus((initial?.dispatcher_status as FreightStatus) ?? "new");
      setPaymentType(initial?.payment_type ? (initial.payment_type as PaymentType) : "none");
      setKind(initial?.freight_kind === "additional" ? "additional" : "main");
    }
  }, [initial]);

  const toggleLM = (m: LoadMethod) =>
    setLoadMethods((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title: title || null,
      loading_city: loadingCity || null,
      unloading_city: unloadingCity || null,
      loading_date: loadingDate || null,
      unloading_date: unloadingDate || null,
      cargo_name: cargoName || null,
      weight_kg: toNum(weight),
      volume_m3: toNum(volume),
      body_type: bodyType || null,
      load_methods: loadMethods,
      rate: toNum(rate),
      payment_type: paymentType === "none" ? null : (paymentType as PaymentType),
      payment_delay_days: toNum(paymentDelay),
      source: source || null,
      source_url: sourceUrl || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      contact_whatsapp: contactWa || null,
      contact_telegram: contactTg || null,
      contact_max_messenger: contactMx || null,
      comment: comment || null,
      dispatcher_status: status,
      freight_kind: kind === "additional" ? "additional" : "main",
    });
  };

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><Label>Название груза</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Москва → Казань, 20т тент" /></div>
        <div><Label>Откуда</Label><Input value={loadingCity} onChange={(e) => setLoadingCity(e.target.value)} /></div>
        <div><Label>Куда</Label><Input value={unloadingCity} onChange={(e) => setUnloadingCity(e.target.value)} /></div>
        <div><Label>Дата загрузки</Label><Input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} /></div>
        <div><Label>Дата выгрузки</Label><Input type="date" value={unloadingDate} onChange={(e) => setUnloadingDate(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Наименование груза</Label><Input value={cargoName} onChange={(e) => setCargoName(e.target.value)} /></div>
        <div><Label>Вес, кг</Label><Input value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        <div><Label>Объём, м³</Label><Input value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
        <div><Label>Тип кузова</Label><Input value={bodyType} onChange={(e) => setBodyType(e.target.value)} placeholder="Тент, реф, борт..." /></div>
        <div>
          <Label>Основной / догруз</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as FreightKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREIGHT_KINDS.map((k) => <SelectItem key={k} value={k}>{FREIGHT_KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Способы загрузки</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {LOAD_METHODS.map((m) => (
              <button type="button" key={m} onClick={() => toggleLM(m)}
                className={`px-3 py-1 rounded-md border text-sm ${
                  loadMethods.includes(m)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground hover:bg-accent"
                }`}>
                {LOAD_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div><Label>Ставка груза, ₽</Label><Input value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <div>
          <Label>Тип оплаты</Label>
          <Select value={paymentType} onValueChange={(v) => setPaymentType(v as typeof paymentType)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— не указан —</SelectItem>
              {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{PAYMENT_TYPE_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Отсрочка, дней</Label><Input value={paymentDelay} onChange={(e) => setPaymentDelay(e.target.value)} /></div>
        <div>
          <Label>Статус</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as FreightStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREIGHT_STATUSES.map((s) => <SelectItem key={s} value={s}>{FREIGHT_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Источник</Label><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="ATI, Монитор, телеграм..." /></div>
        <div><Label>Ссылка на источник</Label><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></div>
        <div className="md:col-span-2 mt-2 border-t pt-3"><div className="text-sm font-semibold mb-2">Контакты</div></div>
        <div><Label>Контактное лицо</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
        <div><Label>Телефон</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
        <div><Label>WhatsApp</Label><Input value={contactWa} onChange={(e) => setContactWa(e.target.value)} placeholder="номер или ссылка" /></div>
        <div><Label>Telegram</Label><Input value={contactTg} onChange={(e) => setContactTg(e.target.value)} placeholder="@username" /></div>
        <div className="md:col-span-2"><Label>Max Messenger</Label><Input value={contactMx} onChange={(e) => setContactMx(e.target.value)} placeholder="Max ID или ссылка" /></div>
        <div className="md:col-span-2"><Label>Комментарий</Label><Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Отмена</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Сохранение..." : "Сохранить"}</Button>
      </div>
    </form>
  );
}

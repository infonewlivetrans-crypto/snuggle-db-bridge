import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CARRIER_KINDS,
  CARRIER_KIND_LABELS,
  CARRIER_STATUSES,
  CARRIER_STATUS_LABELS,
  CARRIER_PAYMENT_METHODS,
  CARRIER_PAYMENT_METHOD_LABELS,
  type CarrierKind,
  type CarrierStatus,
} from "@/lib/dispatcher/statuses";
import type { CarrierDTO } from "@/lib/dispatcher/types";
import type { CarrierCreateInput } from "@/lib/dispatcher/schemas";

interface Props {
  initial?: CarrierDTO | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (data: CarrierCreateInput) => void;
}

const empty = (v: string | null | undefined): string => (v == null ? "" : v);

const isCarrierKind = (value: unknown): value is CarrierKind =>
  typeof value === "string" && CARRIER_KINDS.includes(value as CarrierKind);

const isCarrierStatus = (value: unknown): value is CarrierStatus =>
  typeof value === "string" && CARRIER_STATUSES.includes(value as CarrierStatus);

export function CarrierForm({ initial, submitting, onCancel, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CarrierKind>("individual_entrepreneur");
  const [inn, setInn] = useState("");
  const [ogrn, setOgrn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [maxId, setMaxId] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankBik, setBankBik] = useState("");
  const [bankCorr, setBankCorr] = useState("");
  const [commissionRate, setCommissionRate] = useState("5");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [status, setStatus] = useState<CarrierStatus>("new");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(empty(initial.name));
      setKind((initial.carrier_kind as CarrierKind) || "individual_entrepreneur");
      setInn(empty(initial.inn));
      setOgrn(empty(initial.ogrn));
      setPhone(empty(initial.phone));
      setEmail(empty(initial.email));
      setCity(empty(initial.city));
      setWhatsapp(empty(initial.whatsapp));
      setTelegram(empty(initial.telegram));
      setMaxId(empty(initial.max_messenger));
      setBankName(empty(initial.bank_name));
      setBankAccount(empty(initial.bank_account));
      setBankBik(empty(initial.bank_bik));
      setBankCorr(empty(initial.bank_corr_account));
      setCommissionRate(String(Math.round(((initial.commission_rate ?? 0.05) * 100) * 100) / 100));
      setPaymentMethod(empty(initial.payment_method));
      setStatus((initial.verification_status as CarrierStatus) || "new");
      setComment(empty(initial.dispatcher_comment));
    }
  }, [initial]);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Название обязательно");
      return;
    }
    const percent = Number(commissionRate);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Комиссия должна быть числом 0..100 (%)");
      return;
    }
    const rate = percent / 100;
    const blank = (v: string) => {
      const t = v.trim();
      return t === "" ? null : t;
    };
    const initialCarrierKind = initial?.carrier_kind;
    const initialVerificationStatus = initial?.verification_status;
    const safeCarrierKind: CarrierKind = isCarrierKind(kind)
      ? kind
      : isCarrierKind(initialCarrierKind)
        ? initialCarrierKind
        : "individual_entrepreneur";
    const safeVerificationStatus: CarrierStatus = isCarrierStatus(status)
      ? status
      : isCarrierStatus(initialVerificationStatus)
        ? initialVerificationStatus
        : "new";
    onSubmit({
      name: name.trim(),
      carrier_kind: safeCarrierKind,
      commission_payment_method: null,
      inn: blank(inn),
      ogrn: blank(ogrn),
      phone: blank(phone),
      email: blank(email),
      city: blank(city),
      whatsapp: blank(whatsapp),
      telegram: blank(telegram),
      max_messenger: blank(maxId),
      bank_name: blank(bankName),
      bank_account: blank(bankAccount),
      bank_bik: blank(bankBik),
      bank_corr_account: blank(bankCorr),
      commission_rate: rate,
      payment_method: blank(paymentMethod),
      commission_agreed: false,
      verification_status: safeVerificationStatus,
      dispatcher_comment: blank(comment),
      production_carrier_id: initial?.production_carrier_id ?? null,
    });
  };

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>Название *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Тип</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as CarrierKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CARRIER_KINDS.map((k) => (
                <SelectItem key={k} value={k}>{CARRIER_KIND_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Статус</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as CarrierStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CARRIER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{CARRIER_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>ИНН</Label><Input value={inn} onChange={(e) => setInn(e.target.value)} /></div>
        <div><Label>ОГРН</Label><Input value={ogrn} onChange={(e) => setOgrn(e.target.value)} /></div>
        <div><Label>Город</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><Label>Телефон</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>WhatsApp</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="номер или ссылка" /></div>
        <div><Label>Telegram</Label><Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" /></div>
        <div><Label>Max Messenger</Label><Input value={maxId} onChange={(e) => setMaxId(e.target.value)} placeholder="Max ID или ссылка" /></div>
        <div><Label>Комиссия Радиус Трек (%)</Label><Input value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} inputMode="decimal" placeholder="например, 5" /></div>
        <div>
          <Label>Способ оплаты</Label>
          <Select
            value={
              (CARRIER_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)
                ? paymentMethod
                : ""
            }
            onValueChange={(v) => setPaymentMethod(v)}
          >
            <SelectTrigger><SelectValue placeholder="— не выбрано —" /></SelectTrigger>
            <SelectContent>
              {CARRIER_PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{CARRIER_PAYMENT_METHOD_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Банк</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
        <div><Label>Расч. счёт</Label><Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} /></div>
        <div><Label>БИК</Label><Input value={bankBik} onChange={(e) => setBankBik(e.target.value)} /></div>
        <div><Label>Корр. счёт</Label><Input value={bankCorr} onChange={(e) => setBankCorr(e.target.value)} /></div>
        <div className="md:col-span-2">
          <Label>Комментарий диспетчера</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Отмена</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Сохранение..." : "Сохранить"}</Button>
      </div>
    </form>
  );
}

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
  CARRIER_TAX_REGIMES,
  CARRIER_TAX_REGIME_LABELS,
  type CarrierKind,
  type CarrierStatus,
} from "@/lib/dispatcher/statuses";
import type { CarrierDTO } from "@/lib/dispatcher/types";
import type { CarrierCreateInput } from "@/lib/dispatcher/schemas";
import { CityCombobox } from "@/components/common/CityCombobox";

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
  const [taxRegime, setTaxRegime] = useState("");
  const [inn, setInn] = useState("");
  const [ogrn, setOgrn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [atiId, setAtiId] = useState("");
  const [atiPhone, setAtiPhone] = useState("");
  const [atiEmail, setAtiEmail] = useState("");
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
      setTaxRegime(empty(initial.tax_regime));
      setInn(empty(initial.inn));
      setOgrn(empty(initial.ogrn));
      setPhone(empty(initial.phone));
      setEmail(empty(initial.email));
      setCity(empty(initial.city));
      setAtiId(empty(initial.ati_id));
      setAtiPhone(empty(initial.ati_phone));
      setAtiEmail(empty(initial.ati_email));
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

  // Тип ИНН/ОГРН зависит от вида перевозчика.
  const innRequiredLen = kind === "llc" ? 10 : 12;
  const ogrnRequiredLen = kind === "llc" ? 13 : 15;
  const innDigits = inn.replace(/\D/g, "");
  const ogrnDigits = ogrn.replace(/\D/g, "");
  const phoneDigits = phone.replace(/\D/g, "");
  const innInvalid = innDigits.length > 0 && innDigits.length !== innRequiredLen;
  const ogrnInvalid = ogrnDigits.length > 0 && ogrnDigits.length !== ogrnRequiredLen;
  const phoneInvalid = phoneDigits.length > 0 && phoneDigits.length < 10;
  const requireStrict = status === "ready_to_work";

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Название обязательно");
      return;
    }
    // Strict validation только для статуса «Готов к работе».
    if (requireStrict) {
      if (innDigits.length !== innRequiredLen) {
        setError(`ИНН должен содержать ${innRequiredLen} цифр для выбранного типа`);
        return;
      }
      if (ogrnDigits.length !== ogrnRequiredLen) {
        setError(`ОГРН${kind === "llc" ? "" : "ИП"} должен содержать ${ogrnRequiredLen} цифр`);
        return;
      }
      if (phoneDigits.length < 10) {
        setError("Телефон: минимум 10 цифр");
        return;
      }
    } else {
      // Чёрновое сохранение: проверяем только формат, если поле заполнено.
      const innT = inn.trim();
      if (innT && !/^\d{10}$|^\d{12}$/.test(innT)) {
        setError("ИНН: 10 или 12 цифр");
        return;
      }
      const ogrnT = ogrn.trim();
      if (ogrnT && !/^\d{13}$|^\d{15}$/.test(ogrnT)) {
        setError("ОГРН — 13 цифр, ОГРНИП — 15 цифр");
        return;
      }
      const phoneRe = /^[+\d][\d\s()\-]{5,30}$/;
      if (phone.trim() && !phoneRe.test(phone.trim())) {
        setError("Некорректный телефон");
        return;
      }
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.trim() && !emailRe.test(email.trim())) {
      setError("Некорректный email");
      return;
    }
    if (atiPhone.trim() && !/^[+\d][\d\s()\-]{5,30}$/.test(atiPhone.trim())) {
      setError("Некорректный телефон ATI");
      return;
    }
    if (atiEmail.trim() && !emailRe.test(atiEmail.trim())) {
      setError("Некорректный email ATI");
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
      tax_regime: blank(taxRegime),
      inn: blank(inn),
      ogrn: blank(ogrn),
      phone: blank(phone),
      email: blank(email),
      city: blank(city),
      ati_id: blank(atiId),
      ati_phone: blank(atiPhone),
      ati_email: blank(atiEmail),
      whatsapp: blank(whatsapp),
      telegram: blank(telegram),
      max_messenger: blank(maxId),
      bank_name: blank(bankName),
      bank_account: blank(bankAccount),
      bank_bik: blank(bankBik),
      bank_corr_account: blank(bankCorr),
      commission_rate: rate,
      payment_method: blank(paymentMethod),
      commission_payment_method: initial?.commission_payment_method ?? null,
      commission_agreed: initial?.commission_agreed ?? false,
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
        <div>
          <Label>Налоговый режим</Label>
          <Select
            value={(CARRIER_TAX_REGIMES as readonly string[]).includes(taxRegime) ? taxRegime : ""}
            onValueChange={(v) => setTaxRegime(v)}
          >
            <SelectTrigger><SelectValue placeholder="— не выбрано —" /></SelectTrigger>
            <SelectContent>
              {CARRIER_TAX_REGIMES.map((r) => (
                <SelectItem key={r} value={r}>{CARRIER_TAX_REGIME_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>ИНН</Label><Input value={inn} onChange={(e) => setInn(e.target.value)} inputMode="numeric" placeholder={`${innRequiredLen} цифр`} className={innInvalid ? "border-destructive focus-visible:ring-destructive" : ""} aria-invalid={innInvalid} /></div>
        <div><Label>ОГРН / ОГРНИП</Label><Input value={ogrn} onChange={(e) => setOgrn(e.target.value)} inputMode="numeric" placeholder={`${ogrnRequiredLen} цифр`} className={ogrnInvalid ? "border-destructive focus-visible:ring-destructive" : ""} aria-invalid={ogrnInvalid} /></div>
        <div><Label>Город</Label><CityCombobox value={city} onChange={setCity} /></div>
        <div><Label>Телефон</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={phoneInvalid ? "border-destructive focus-visible:ring-destructive" : ""} aria-invalid={phoneInvalid} /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>ATI ID</Label><Input value={atiId} onChange={(e) => setAtiId(e.target.value)} placeholder="например 123456" /></div>
        <div><Label>Телефон (как в ATI)</Label><Input value={atiPhone} onChange={(e) => setAtiPhone(e.target.value)} inputMode="tel" /></div>
        <div><Label>Email (как в ATI)</Label><Input type="email" value={atiEmail} onChange={(e) => setAtiEmail(e.target.value)} /></div>
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

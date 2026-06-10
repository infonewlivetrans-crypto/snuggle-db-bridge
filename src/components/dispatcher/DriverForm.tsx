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
  DRIVER_STATUSES,
  DRIVER_STATUS_LABELS,
  RUSSIAN_CITIES_PRESET,
  type DriverStatus,
} from "@/lib/dispatcher/statuses";
import type { CarrierDTO, DriverDTO } from "@/lib/dispatcher/types";
import type { DriverCreateInput } from "@/lib/dispatcher/schemas";

interface Props {
  initial?: DriverDTO | null;
  carriers: CarrierDTO[];
  /** Если форма открыта из контекста перевозчика — заранее выбрать его. */
  initialCarrierId?: string | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (data: DriverCreateInput) => void;
}

const empty = (v: string | null | undefined): string => (v == null ? "" : v);

function carrierLabel(c: CarrierDTO): string {
  const parts: string[] = [c.name ?? c.id];
  const extras: string[] = [];
  if (c.phone) extras.push(c.phone);
  if (c.inn) extras.push(`ИНН ${c.inn}`);
  if (extras.length) parts.push(`— ${extras.join(", ")}`);
  return parts.join(" ");
}

export function DriverForm({
  initial,
  carriers,
  initialCarrierId,
  submitting,
  onCancel,
  onSubmit,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [maxId, setMaxId] = useState("");
  const [city, setCity] = useState("");
  const [carrierId, setCarrierId] = useState<string>("none");
  const [status, setStatus] = useState<DriverStatus>("new");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setFullName(empty(initial.full_name));
      setPhone(empty(initial.phone));
      setEmail(empty(initial.email));
      setWhatsapp(empty(initial.whatsapp));
      setTelegram(empty(initial.telegram));
      setMaxId(empty(initial.max_messenger));
      setCity(empty(initial.city));
      setCarrierId(initial.dispatcher_carrier_ext_id ?? "none");
      // Статус берём из БД; пустую строку нормализуем в "new".
      const s = (initial.dispatcher_status || "new") as DriverStatus;
      setStatus(
        (DRIVER_STATUSES as readonly string[]).includes(s) ? s : "new",
      );
      setComment(empty(initial.dispatcher_comment));
    } else if (initialCarrierId) {
      setCarrierId(initialCarrierId);
    }
  }, [initial, initialCarrierId]);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("ФИО обязательно");
      return;
    }
    const finalStatus: DriverStatus =
      status && (DRIVER_STATUSES as readonly string[]).includes(status)
        ? status
        : "new";
    onSubmit({
      full_name: fullName.trim(),
      phone: phone || null,
      email: email || null,
      whatsapp: whatsapp || null,
      telegram: telegram || null,
      max_messenger: maxId || null,
      city: city || null,
      dispatcher_carrier_ext_id: carrierId === "none" ? null : carrierId,
      dispatcher_status: finalStatus,
      docs_verified: initial?.docs_verified ?? false,
      dispatcher_comment: comment || null,
      production_driver_id: initial?.production_driver_id ?? null,
    });
  };

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>ФИО *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="md:col-span-2">
          <Label>Перевозчик</Label>
          <Select value={carrierId} onValueChange={setCarrierId}>
            <SelectTrigger><SelectValue placeholder="— не привязан —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— не привязан —</SelectItem>
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {carrierLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Статус</Label>
          <Select
            value={status}
            onValueChange={(v) => v && setStatus(v as DriverStatus)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DRIVER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{DRIVER_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Город</Label>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            list="driver-cities"
            placeholder="Краснодар, Москва…"
          />
          <datalist id="driver-cities">
            {RUSSIAN_CITIES_PRESET.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div><Label>Телефон</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" /></div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>WhatsApp</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
        <div><Label>Telegram</Label><Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" /></div>
        <div><Label>Max Messenger</Label><Input value={maxId} onChange={(e) => setMaxId(e.target.value)} /></div>
        <div className="md:col-span-2">
          <Label>Комментарий диспетчера</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Документы водителя (паспорт, ВУ, пропуска) загружаются в карточке водителя
        через общий блок «Документы» после сохранения.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Отмена</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Сохранение..." : "Сохранить"}</Button>
      </div>
    </form>
  );
}

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PAYMENT_LABELS, type PaymentType } from "@/lib/orders";
import { parseCoords } from "@/lib/geo";
import { MapPin, Compass, Upload, Loader2, X } from "lucide-react";

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrderDialog({ open, onOpenChange }: CreateOrderDialogProps) {
  const queryClient = useQueryClient();
  const [orderNumber, setOrderNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [coordsInput, setCoordsInput] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [landmarks, setLandmarks] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [comment, setComment] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [requiresQr, setRequiresQr] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setOrderNumber("");
    setDeliveryAddress("");
    setCoordsInput("");
    setLatitude("");
    setLongitude("");
    setMapLink("");
    setLandmarks("");
    setAccessInstructions("");
    setContactName("");
    setContactPhone("");
    setComment("");
    setPaymentType("cash");
    setRequiresQr(false);
    setPhotoUrl(null);
  };

  const handleCoordsPaste = (value: string) => {
    setCoordsInput(value);
    const parsed = parseCoords(value);
    if (parsed) {
      setLatitude(String(parsed.lat));
      setLongitude(String(parsed.lng));
    }
  };

  const handlePhoto = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("delivery-photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("delivery-photos").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
      toast.success("Фото загружено");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orderNumber.trim()) throw new Error("Укажите номер заказа");

      const lat = latitude ? Number(latitude) : null;
      const lng = longitude ? Number(longitude) : null;
      const hasAddress = deliveryAddress.trim().length > 0;
      const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

      if (!hasAddress && !hasCoords) {
        throw new Error("Укажите адрес или координаты точки доставки");
      }

      const { error } = await supabase.from("orders").insert({
        order_number: orderNumber.trim(),
        delivery_address: hasAddress ? deliveryAddress.trim() : null,
        latitude: hasCoords ? lat : null,
        longitude: hasCoords ? lng : null,
        map_link: mapLink.trim() || null,
        landmarks: landmarks.trim() || null,
        access_instructions: accessInstructions.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        comment: comment.trim() || null,
        payment_type: paymentType,
        requires_qr: requiresQr,
        delivery_photo_url: photoUrl,
        status: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Заказ создан");
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создание заказа</DialogTitle>
          <DialogDescription>
            Можно указать адрес или только координаты — для дач, СНТ, полей и точек без точного адреса
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="num">Номер заказа *</Label>
              <Input
                id="num"
                placeholder="ORD-001"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="pay">Тип оплаты</Label>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
                <SelectTrigger id="pay" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Локация: адрес или координаты */}
          <Tabs defaultValue="address" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="address" className="gap-1.5">
                <MapPin className="h-4 w-4" />
                Адрес
              </TabsTrigger>
              <TabsTrigger value="coords" className="gap-1.5">
                <Compass className="h-4 w-4" />
                Координаты
              </TabsTrigger>
            </TabsList>
            <TabsContent value="address" className="mt-3">
              <Label htmlFor="addr">Адрес доставки</Label>
              <Textarea
                id="addr"
                placeholder="г. Москва, ул. Ленина, 10"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="mt-1.5"
                rows={2}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Если адреса нет — переключитесь на «Координаты»
              </p>
            </TabsContent>
            <TabsContent value="coords" className="mt-3 space-y-3">
              <div>
                <Label htmlFor="paste">Вставить координаты</Label>
                <Input
                  id="paste"
                  placeholder="55.7558, 37.6173"
                  value={coordsInput}
                  onChange={(e) => handleCoordsPaste(e.target.value)}
                  className="mt-1.5 font-mono"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Можно вставить из Я.Карт / Google Maps / 2ГИС
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="lat">Широта</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="0.0000001"
                    placeholder="55.7558"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="mt-1.5 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="lng">Долгота</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="0.0000001"
                    placeholder="37.6173"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="mt-1.5 font-mono"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="addr2">Адрес (если есть)</Label>
                <Input
                  id="addr2"
                  placeholder="СНТ Берёзка, участок 42"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div>
            <Label htmlFor="map">Ссылка на карту</Label>
            <Input
              id="map"
              placeholder="https://yandex.ru/maps/..."
              value={mapLink}
              onChange={(e) => setMapLink(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="landmarks">Ориентиры</Label>
              <Textarea
                id="landmarks"
                placeholder="Зелёные ворота, рядом с водонапорной башней"
                value={landmarks}
                onChange={(e) => setLandmarks(e.target.value)}
                className="mt-1.5"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="access">Как проехать</Label>
              <Textarea
                id="access"
                placeholder="Свернуть после АЗС направо, ехать 2 км по грунтовке"
                value={accessInstructions}
                onChange={(e) => setAccessInstructions(e.target.value)}
                className="mt-1.5"
                rows={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cname">Контакт клиента</Label>
              <Input
                id="cname"
                placeholder="Иван Петров"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cphone">Телефон клиента</Label>
              <Input
                id="cphone"
                type="tel"
                placeholder="+7 900 000-00-00"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Фото места выгрузки */}
          <div>
            <Label>Фото места выгрузки</Label>
            {photoUrl ? (
              <div className="mt-1.5 flex items-start gap-3 rounded-lg border border-border p-2">
                <img
                  src={photoUrl}
                  alt="Место выгрузки"
                  className="h-20 w-28 rounded-md object-cover"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPhotoUrl(null)}
                  className="h-7 w-7 text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-sm text-muted-foreground hover:bg-secondary/60">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Загрузить фото
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhoto(f);
                  }}
                />
              </label>
            )}
          </div>

          <div>
            <Label htmlFor="cmt">Комментарий</Label>
            <Textarea
              id="cmt"
              placeholder="Дополнительная информация для водителя"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1.5"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3">
            <Label htmlFor="qr" className="text-sm font-medium">
              Требуется QR-код
            </Label>
            <Switch id="qr" checked={requiresQr} onCheckedChange={setRequiresQr} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Создание..." : "Создать заказ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

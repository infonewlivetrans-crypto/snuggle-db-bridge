import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";

const SETTING_KEY = "incoming_email";

type Settings = {
  incoming_email_enabled: boolean;
  incoming_email_provider:
    | "manual"
    | "imap"
    | "gmail"
    | "yandex"
    | "mailru"
    | "other";
  incoming_email_address: string;
  incoming_email_host: string;
  incoming_email_port: number | null;
  incoming_email_secure: boolean;
  incoming_email_login: string;
  // Пароль не храним в чистом виде — указываем только ссылку на секрет,
  // который должен быть добавлен через защищённый механизм Lovable Cloud.
  incoming_email_password_secret_ref: string;
  incoming_email_comment: string;
  incoming_email_last_sync_at: string | null;
};

const DEFAULT_SETTINGS: Settings = {
  incoming_email_enabled: false,
  incoming_email_provider: "manual",
  incoming_email_address: "",
  incoming_email_host: "",
  incoming_email_port: null,
  incoming_email_secure: true,
  incoming_email_login: "",
  incoming_email_password_secret_ref: "",
  incoming_email_comment: "",
  incoming_email_last_sync_at: null,
};

interface Props {
  onClose?: () => void;
}

export function IncomingEmailSettingsDialog({ onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [value, setValue] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<{
          settings: Array<{
            id: string;
            setting_key: string;
            setting_value: unknown;
          }>;
        }>(`/api/system-settings?setting_key=${SETTING_KEY}`, { auth: true });
        const row = res.settings?.[0];
        if (!cancelled && row) {
          setSettingId(row.id);
          setValue({
            ...DEFAULT_SETTINGS,
            ...((row.setting_value as Partial<Settings>) ?? {}),
          });
        }
      } catch {
        /* ignore — оставляем дефолты */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (settingId) {
        await apiPatch(`/api/system-settings/${settingId}`, {
          setting_value: value,
        });
      } else {
        const res = await apiPost<{ id: string }>("/api/system-settings", {
          setting_key: SETTING_KEY,
          setting_value: value,
          category: "incoming_email",
          description: "Настройки входящей почты для AI-диспетчера",
          is_public: false,
        });
        if (res?.id) setSettingId(res.id);
      }
      toast.success("Настройки сохранены");
      onClose?.();
    } catch (e) {
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const isManual = value.incoming_email_provider === "manual";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border p-2">
        <div>
          <div className="text-sm font-medium">Автоматический сбор писем</div>
          <div className="text-xs text-muted-foreground">
            Пока не подключён — заявки импортируются вручную
          </div>
        </div>
        <Switch
          checked={value.incoming_email_enabled}
          onCheckedChange={(v) =>
            setValue({ ...value, incoming_email_enabled: v })
          }
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Провайдер</Label>
          <Select
            value={value.incoming_email_provider}
            onValueChange={(v) =>
              setValue({
                ...value,
                incoming_email_provider: v as Settings["incoming_email_provider"],
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Ручной ввод</SelectItem>
              <SelectItem value="imap">IMAP</SelectItem>
              <SelectItem value="gmail">Gmail</SelectItem>
              <SelectItem value="yandex">Яндекс</SelectItem>
              <SelectItem value="mailru">Mail.ru</SelectItem>
              <SelectItem value="other">Другое</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Адрес ящика</Label>
          <Input
            value={value.incoming_email_address}
            onChange={(e) =>
              setValue({ ...value, incoming_email_address: e.target.value })
            }
            placeholder="dispatcher@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Хост IMAP</Label>
          <Input
            value={value.incoming_email_host}
            onChange={(e) =>
              setValue({ ...value, incoming_email_host: e.target.value })
            }
            placeholder="imap.example.com"
            disabled={isManual}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Порт</Label>
          <Input
            type="number"
            value={value.incoming_email_port ?? ""}
            onChange={(e) =>
              setValue({
                ...value,
                incoming_email_port: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder="993"
            disabled={isManual}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Логин</Label>
          <Input
            value={value.incoming_email_login}
            onChange={(e) =>
              setValue({ ...value, incoming_email_login: e.target.value })
            }
            disabled={isManual}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Имя секрета с паролем</Label>
          <Input
            value={value.incoming_email_password_secret_ref}
            onChange={(e) =>
              setValue({
                ...value,
                incoming_email_password_secret_ref: e.target.value,
              })
            }
            placeholder="INCOMING_EMAIL_PASSWORD"
            disabled={isManual}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Switch
            checked={value.incoming_email_secure}
            onCheckedChange={(v) =>
              setValue({ ...value, incoming_email_secure: v })
            }
            disabled={isManual}
          />
          <Label className="text-xs">SSL/TLS соединение</Label>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Комментарий</Label>
          <Textarea
            value={value.incoming_email_comment}
            onChange={(e) =>
              setValue({ ...value, incoming_email_comment: e.target.value })
            }
            rows={2}
          />
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
        Пароль ящика никогда не хранится в открытом виде. Укажите имя секрета,
        который добавлен через защищённое хранилище Lovable Cloud. Автоматическая
        синхронизация будет включена на следующем этапе после настройки секрета.
      </div>

      {value.incoming_email_last_sync_at ? (
        <div className="text-xs text-muted-foreground">
          Последняя проверка: {new Date(value.incoming_email_last_sync_at).toLocaleString("ru-RU")}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

// Настройки звука и вибрации уведомления «Новая подходящая заявка».
// Хранятся локально (на устройстве).
import { Volume2, VolumeX, Play, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useNotifSoundSettings,
  triggerVibration,
} from "@/lib/notifications/sound-settings";
import { playSignalSound } from "@/components/IncomingOfferWatcher";

export function NotifSoundSettingsCard() {
  const {
    settings,
    vibrationSupported,
    setEnabled,
    setVolume,
    setVibrate,
  } = useNotifSoundSettings();
  const volumePct = Math.round(settings.volume * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {settings.enabled && settings.volume > 0 ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
          Звук и вибрация уведомлений
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="notif-sound-enabled" className="text-sm">
              Звуковой сигнал «Новая подходящая заявка»
            </Label>
            <div className="text-xs text-muted-foreground">
              Звучит при поступлении нового предложения рейса.
            </div>
          </div>
          <Switch
            id="notif-sound-enabled"
            checked={settings.enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Громкость</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {volumePct}%
            </span>
          </div>
          <Slider
            value={[volumePct]}
            onValueChange={([v]) => setVolume((v ?? 0) / 100)}
            min={0}
            max={100}
            step={5}
            disabled={!settings.enabled}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="space-y-0.5">
            <Label
              htmlFor="notif-vibrate"
              className="flex items-center gap-1.5 text-sm"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Вибрация на устройстве
            </Label>
            <div className="text-xs text-muted-foreground">
              {vibrationSupported
                ? "Короткая вибрация вместе со звуком (Android и поддерживающие браузеры)."
                : "Это устройство/браузер не поддерживает вибрацию (например, iOS Safari)."}
            </div>
          </div>
          <Switch
            id="notif-vibrate"
            checked={settings.vibrate}
            onCheckedChange={setVibrate}
            disabled={!vibrationSupported}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => playSignalSound(settings.volume)}
            disabled={!settings.enabled || settings.volume <= 0}
            className="gap-1.5"
          >
            <Play className="h-3.5 w-3.5" />
            Прослушать звук
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerVibration([120, 60, 120, 60, 200])}
            disabled={!vibrationSupported || !settings.vibrate}
            className="gap-1.5"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Проверить вибрацию
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

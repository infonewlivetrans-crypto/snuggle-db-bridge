// AgentDownloadButton — единая кнопка «Скачать Radius Track Agent».
// Fetch+Blob подход: прямые ссылки на static-файлы в preview-окружении
// требуют аутентификации, blob работает везде.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AgentRelease } from "@/lib/ai-dispatcher/agent-release";
import { formatBytes } from "@/lib/ai-dispatcher/agent-release";

interface Props {
  release: AgentRelease | null;
  loading: boolean;
  disabled?: boolean;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
  onDownloaded?: () => void;
}

export function AgentDownloadButton({
  release,
  loading,
  disabled,
  size = "default",
  variant = "default",
  onDownloaded,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!release) return;
    setDownloading(true);
    try {
      const res = await fetch(release.downloadUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = release.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onDownloaded?.();
    } catch (e) {
      toast.error(
        `Не удалось скачать: ${e instanceof Error ? e.message : "неизвестная ошибка"}`,
      );
    } finally {
      setDownloading(false);
    }
  };

  const isDisabled = disabled || loading || !release || downloading;
  const label = downloading
    ? "Скачиваем…"
    : loading
      ? "Загружаем данные…"
      : release
        ? `Скачать Radius Track Agent ${release.latestVersion} (${formatBytes(release.sizeBytes)})`
        : "Скачивание недоступно";

  return (
    <Button
      onClick={handleDownload}
      disabled={isDisabled}
      size={size}
      variant={variant}
    >
      {downloading || loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-2" />
      )}
      {label}
    </Button>
  );
}

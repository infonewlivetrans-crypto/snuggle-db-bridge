import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { openRouteManifest } from "@/lib/routeManifest";

type Props = {
  deliveryRouteId: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
};

export function RouteManifestButton({
  deliveryRouteId,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await openRouteManifest(deliveryRouteId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className ? `${className} gap-1.5` : "gap-1.5"}
      onClick={handleClick}
      disabled={loading}
    >
      <FileDown className="h-4 w-4" />
      {loading ? "Подготовка…" : "Скачать маршрутный лист"}
    </Button>
  );
}

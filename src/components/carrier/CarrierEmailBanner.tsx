// Баннер на /carrier: «Подключите почту, чтобы диспетчер мог отправлять данные грузовладельцу».
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mail, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGetAuth } from "@/lib/api-client";

interface SafeRow {
  row: {
    email: string;
    is_active: boolean;
    is_verified: boolean;
    has_password: boolean;
  } | null;
}

export function CarrierEmailBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "email-account"],
    queryFn: () => apiGetAuth<SafeRow>("/api/carrier/email-account", 10000),
    staleTime: 60_000,
  });

  if (isLoading) return null;
  const row = data?.row ?? null;
  const ready = !!row && row.is_active && row.has_password;
  if (ready) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">Подключите почту</div>
          <div className="text-xs">
            Тогда диспетчер сможет отправлять ваши данные грузовладельцу с вашего адреса.
          </div>
        </div>
      </div>
      <Button asChild size="sm">
        <Link to="/carrier/email-settings">
          <Mail className="mr-1 h-4 w-4" /> Подключить почту
        </Link>
      </Button>
    </div>
  );
}

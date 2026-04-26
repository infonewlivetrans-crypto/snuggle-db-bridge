import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CARRIER_TYPE_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_STYLES,
  type Carrier,
  type CarrierVerificationStatus,
} from "@/lib/carriers";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, XCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/carriers/verification")({
  head: () => ({ meta: [{ title: "Проверка перевозчиков — Радиус Трек" }] }),
  component: VerificationPage,
});

function VerificationPage() {
  const qc = useQueryClient();

  const { data: carriers, isLoading } = useQuery({
    queryKey: ["carriers", "verification-queue"],
    queryFn: async (): Promise<Carrier[]> => {
      const { data, error } = await db
        .from("carriers")
        .select("*")
        .in("verification_status", ["new", "in_review"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CarrierVerificationStatus }) => {
      const { error } = await db.from("carriers").update({ verification_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carriers", "verification-queue"] });
      qc.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Статус обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const newOnes = (carriers ?? []).filter((c) => c.verification_status === "new");
  const inReview = (carriers ?? []).filter((c) => c.verification_status === "in_review");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Проверка перевозчиков
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Очередь новых и проверяемых перевозчиков
          </p>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Загрузка...</div>
        ) : (carriers?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
            <div className="text-sm text-muted-foreground">Все перевозчики проверены</div>
          </div>
        ) : (
          <div className="space-y-6">
            <Section title="Новые" items={newOnes} accent="blue" onUpdate={update.mutate} />
            <Section title="На проверке" items={inReview} accent="amber" onUpdate={update.mutate} />
          </div>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  items,
  accent,
  onUpdate,
}: {
  title: string;
  items: Carrier[];
  accent: "blue" | "amber";
  onUpdate: (v: { id: string; status: CarrierVerificationStatus }) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        {title} <span className="text-sm font-normal text-muted-foreground">· {items.length}</span>
      </h2>
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/carriers/$carrierId"
                    params={{ carrierId: c.id }}
                    className="text-base font-semibold text-foreground hover:text-primary"
                  >
                    {c.company_name}
                  </Link>
                  <Badge variant="outline" className="border-border bg-secondary text-xs">
                    {CARRIER_TYPE_LABELS[c.carrier_type]}
                  </Badge>
                  <Badge variant="outline" className={VERIFICATION_STYLES[c.verification_status]}>
                    {VERIFICATION_LABELS[c.verification_status]}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.inn && <span>ИНН: <span className="font-mono">{c.inn}</span></span>}
                  {c.city && <span>{c.city}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.verification_status === "new" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUpdate({ id: c.id, status: "in_review" })}
                    className="gap-1.5"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    На проверку
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => onUpdate({ id: c.id, status: "approved" })}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Подтвердить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdate({ id: c.id, status: "rejected" })}
                  className="gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  Отклонить
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="sr-only">{accent}</div>
    </section>
  );
}

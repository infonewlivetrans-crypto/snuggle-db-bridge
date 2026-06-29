// Бейдж риска отличия snapshot.
import { Badge } from "@/components/ui/badge";

export type SnapshotRiskLevel = "info" | "warning" | "critical";

const LABEL: Record<SnapshotRiskLevel, string> = {
  info: "Данные совпадают",
  warning: "Есть отличия",
  critical: "Критическое отличие",
};

const VARIANT: Record<SnapshotRiskLevel, "default" | "secondary" | "destructive" | "outline"> = {
  info: "default",
  warning: "secondary",
  critical: "destructive",
};

export function SnapshotDiffBadge({
  level, text,
}: { level: SnapshotRiskLevel; text?: string }) {
  return <Badge variant={VARIANT[level]}>{text ?? LABEL[level]}</Badge>;
}

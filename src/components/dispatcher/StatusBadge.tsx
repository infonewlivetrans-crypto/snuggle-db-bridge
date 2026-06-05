import { statusBadgeClass } from "@/lib/dispatcher/statuses";

interface Props {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
        status,
      )}`}
    >
      {label ?? status}
    </span>
  );
}

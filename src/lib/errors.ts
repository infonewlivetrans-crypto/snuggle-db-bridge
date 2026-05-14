// Универсальная классификация и человекочитаемые сообщения об ошибках.
// Используется компонентом ErrorState и ErrorBoundary, а также при ручной
// отправке отчёта администратору.

export type ErrorKind =
  | "no_access"
  | "load"
  | "save"
  | "import"
  | "photo"
  | "network"
  | "supabase"
  | "permission"
  | "unknown";

export const ERROR_TITLES: Record<ErrorKind, string> = {
  no_access: "Нет доступа к этому разделу",
  load: "Не удалось загрузить данные",
  save: "Не удалось сохранить изменения",
  import: "Ошибка импорта файла",
  photo: "Не удалось загрузить фото",
  network: "Нет соединения с сервером",
  supabase: "Ошибка базы данных",
  permission: "Недостаточно прав",
  unknown: "Произошла ошибка",
};

export const ERROR_HINTS: Record<ErrorKind, string> = {
  no_access:
    "У вашей роли нет доступа к этому разделу. Обратитесь к администратору, чтобы получить нужные права.",
  load:
    "Проверьте подключение к интернету и нажмите «Повторить». Если ошибка повторяется — сообщите администратору.",
  save:
    "Изменения не были сохранены. Проверьте корректность введённых данных и повторите попытку.",
  import:
    "Файл не удалось обработать. Убедитесь, что используете правильный шаблон, и попробуйте ещё раз.",
  photo:
    "Не удалось загрузить фото. Проверьте размер и формат файла, а также подключение к сети.",
  network:
    "Сервер недоступен или интернет нестабилен. Подождите несколько секунд и нажмите «Повторить».",
  supabase:
    "Сервер базы данных временно недоступен. Попробуйте ещё раз через минуту.",
  permission:
    "Действие запрещено для вашей роли. Если считаете, что это ошибка — сообщите администратору.",
  unknown:
    "Что-то пошло не так. Попробуйте повторить действие или сообщите администратору.",
};

export function classifyError(err: unknown): ErrorKind {
  const msg = errorMessage(err).toLowerCase();
  if (
    msg.includes("нет доступа") ||
    msg.includes("forbidden") ||
    msg.includes("403") ||
    msg.includes("rls") ||
    msg.includes("row-level security") ||
    msg.includes("row level security")
  ) {
    return msg.includes("права") || msg.includes("role") ? "permission" : "no_access";
  }
  if (msg.includes("401") || msg.includes("unauthor")) return "permission";
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("net::") ||
    msg.includes("connection") ||
    msg.includes("timeout")
  ) {
    return "network";
  }
  if (
    msg.includes("supabase") ||
    msg.includes("postgres") ||
    msg.includes("pgrst") ||
    msg.includes("duplicate key") ||
    msg.includes("violates")
  ) {
    return "supabase";
  }
  if (msg.includes("импорт") || msg.includes("import") || msg.includes("xlsx") || msg.includes("csv")) {
    return "import";
  }
  if (msg.includes("фото") || msg.includes("upload") || msg.includes("storage")) {
    return "photo";
  }
  if (msg.includes("сохран") || msg.includes("save") || msg.includes("update")) {
    return "save";
  }
  if (msg.includes("загруз") || msg.includes("load") || msg.includes("fetch")) {
    return "load";
  }
  return "unknown";
}

export function errorMessage(err: unknown): string {
  if (!err) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function errorTechnical(err: unknown): string {
  if (err instanceof Error) {
    return [err.message, err.stack].filter(Boolean).join("\n").slice(0, 8000);
  }
  return errorMessage(err).slice(0, 8000);
}

export function reportError(error?: unknown, context?: unknown) {
  console.error("System error:", error, context);
}

export function notifyAdminAboutError(message?: unknown) {
  console.warn("Admin notification disabled:", message);
}

export function notifyAdmin(message?: unknown) {
  console.warn("Admin notification disabled:", message);
}

export default reportError;

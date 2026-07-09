export function normalizeAuthState(value: unknown): "unknown" | "authenticated" | "login_required";
export function shouldEmitLoginRequired(previous: unknown, current: unknown): boolean;
export function shouldEmitLoginDetected(previous: unknown, current: unknown): boolean;

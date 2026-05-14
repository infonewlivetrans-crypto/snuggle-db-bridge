export async function startImpersonationFn(..._args: unknown[]) {
  throw new Error("Impersonation is disabled in production build");
}

export async function stopImpersonationFn(..._args: unknown[]) {
  throw new Error("Impersonation is disabled in production build");
}

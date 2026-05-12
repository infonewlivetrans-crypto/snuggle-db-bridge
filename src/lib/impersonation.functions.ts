type StartResult = {
  targetUserId: string;
  profile: {
    id?: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_active?: boolean;
    carrier_id?: string | null;
  };
  roles: string[];
  startedAt: string;
};

export async function startImpersonationFn(..._args: unknown[]): Promise<StartResult> {
  throw new Error("Impersonation is disabled in production build");
}

export async function stopImpersonationFn(..._args: unknown[]): Promise<{ ok: true }> {
  throw new Error("Impersonation is disabled in production build");
}

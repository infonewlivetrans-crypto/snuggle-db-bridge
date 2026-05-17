import {
  adminCreateInvite,
  adminDeleteInvite,
  adminListInvites,
  adminRotateInviteToken,
  adminSetInviteActive,
  type CreateInviteArgs,
  type InviteRow,
  type InviteRole,
} from "@/server/invites.server";
import { assertCallerIsAdmin, requireAuthenticatedUser } from "./auth.server";

export type { InviteRole, InviteRow };

export async function listInvites(): Promise<InviteRow[]> {
  const { userId, client } = await requireAuthenticatedUser();
  await assertCallerIsAdmin(userId, client);
  return adminListInvites();
}

export async function createInvite(data: CreateInviteArgs): Promise<InviteRow> {
  const { userId, client } = await requireAuthenticatedUser();
  await assertCallerIsAdmin(userId, client);
  return adminCreateInvite({ ...data, createdBy: userId });
}

export async function setInviteActive(data: { id: string; isActive: boolean }) {
  const { userId, client } = await requireAuthenticatedUser();
  await assertCallerIsAdmin(userId, client);
  await adminSetInviteActive(data);
  return { ok: true };
}

export async function rotateInviteToken(data: { id: string }): Promise<InviteRow> {
  const { userId, client } = await requireAuthenticatedUser();
  await assertCallerIsAdmin(userId, client);
  return adminRotateInviteToken(data);
}

export async function deleteInvite(data: { id: string }) {
  const { userId, client } = await requireAuthenticatedUser();
  await assertCallerIsAdmin(userId, client);
  await adminDeleteInvite(data);
  return { ok: true };
}
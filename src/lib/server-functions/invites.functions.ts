// Реэкспорт серверных функций для удобного импорта из UI.
export {
  listInvitesFn,
  createInviteFn,
  setInviteActiveFn,
  rotateInviteTokenFn,
  deleteInviteFn,
} from "@/server/invites.functions";
export type { InviteRole } from "@/server/invites.server";

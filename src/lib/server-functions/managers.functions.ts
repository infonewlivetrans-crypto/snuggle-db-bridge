// Реэкспорт серверных функций для импорта из UI.
export {
  listManagersFn,
  importManagersFn,
  createManagerFn,
  updateManagerFn,
  deleteManagerFn,
  importCarriersFn,
} from "@/server/managers.functions";
export type { ManagerRow } from "@/server/managers.server";

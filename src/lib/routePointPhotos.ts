export type RoutePointPhotoKind =
  | "qr"
  | "signed_docs"
  | "payment"
  | "problem"
  | "unloading_place";

export const ROUTE_POINT_PHOTO_KIND_LABELS: Record<RoutePointPhotoKind, string> = {
  qr: "Фото QR-кода",
  signed_docs: "Подписанные документы",
  payment: "Оплата / подтверждение",
  problem: "Фото проблемы",
  unloading_place: "Место выгрузки",
};

export const ROUTE_POINT_PHOTO_KIND_ORDER: RoutePointPhotoKind[] = [
  "qr",
  "signed_docs",
  "payment",
  "problem",
  "unloading_place",
];

export const ROUTE_POINT_PHOTOS_BUCKET = "route-point-photos";

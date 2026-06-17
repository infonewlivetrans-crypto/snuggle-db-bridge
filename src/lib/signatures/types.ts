// Общие типы подписи перевозчика на входящих документах.

export interface BBox {
  x: number; y: number; w: number; h: number;
}

export interface BgRemoval {
  threshold: number; // 200..250
  contrast: number;  // -50..50
}

export interface Placement {
  page: number;                            // 1-based номер страницы
  stamp:     { x: number; y: number; w: number };
  signature: { x: number; y: number; w: number };
}

export interface SignatureAsset {
  id: string;
  carrier_ext_id: string;
  uploaded_by: string | null;
  source_file_path: string | null;
  stamp_file_path: string | null;
  signature_file_path: string | null;
  stamp_bbox: BBox | null;
  signature_bbox: BBox | null;
  bg_removal: BgRemoval | null;
  is_active: boolean;
  consent_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentSignature {
  id: string;
  inbound_document_id: string | null;
  trip_id: string | null;
  carrier_ext_id: string;
  source_document_path: string;
  signed_document_path: string | null;
  manual_signed_document_path: string | null;
  signature_asset_id: string | null;
  status:
    | "draft"
    | "preview"
    | "signed"
    | "manual_uploaded"
    | "failed"
    | "cancelled";
  placement: Placement | null;
  signed_by: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

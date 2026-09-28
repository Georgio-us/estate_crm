export type DevelopmentConstructionStatus = "PLANNED" | "UNDER_CONSTRUCTION" | "COMPLETED" | "PAUSED";
export type DevelopmentSalesStatus = "EXPECTED" | "LAUNCH" | "OPEN" | "CLOSED";
export type DevelopmentAssetKind = "COVER" | "GALLERY" | "CHESSBOARD" | "PRICE_LIST" | "LAYOUT" | "PROMOTION" | "PRESENTATION" | "PERMIT" | "OTHER";
export type DevelopmentAssetStatus = "PENDING" | "READY" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED";

export interface DevelopmentAssetRecord {
  id: string; projectId: string; filename: string; mimeType: string; sizeBytes: number; kind: DevelopmentAssetKind;
  status: DevelopmentAssetStatus; version: number; isCover: boolean; sortOrder: number; errorMessage: string | null;
  url: string; createdAt: string; readyAt: string | null;
  importBatch: null | { id: string; assetId: string; status: "DRAFT" | "PROCESSING" | "REVIEW_REQUIRED" | "PUBLISHED" | "FAILED"; parserKey: string | null; rowCount: number; approvedCount: number; errorMessage: string | null; createdAt: string; updatedAt: string; publishedAt: string | null };
}

export interface DevelopmentProjectRecord {
  id: string; developerId: string; slug: string; name: string; address: string | null; district: string | null; description: string | null;
  constructionStatus: DevelopmentConstructionStatus; salesStatus: DevelopmentSalesStatus; plannedCompletion: string | null; className: string | null;
  buildingsCount: number | null; sectionsCount: number | null; floors: string | null; imageUrl: string | null; sourceUrl: string | null;
  verifiedAt: string | null; archivedAt: string | null; createdAt: string; updatedAt: string;
}

export interface DevelopmentDeveloperRecord {
  id: string; slug: string; name: string; description: string | null; website: string | null; phone: string | null; email: string | null;
  logoUrl: string | null; coverUrl: string | null; sourceUrl: string | null; verifiedAt: string | null; archivedAt: string | null;
  projectCounts: { all: number; construction: number; completed: number; launch: number };
  projects?: DevelopmentProjectRecord[]; createdAt: string; updatedAt: string;
}

export interface CreateDevelopmentDeveloperRequest { name: string; description?: string | null; website?: string | null; phone?: string | null; email?: string | null; logoUrl?: string | null; sourceUrl?: string | null }
export interface CreateDevelopmentProjectRequest {
  name: string; address?: string | null; district?: string | null; description?: string | null; constructionStatus?: DevelopmentConstructionStatus;
  salesStatus?: DevelopmentSalesStatus; plannedCompletion?: string | null; className?: string | null; buildingsCount?: number | null;
  sectionsCount?: number | null; floors?: string | null; imageUrl?: string | null; sourceUrl?: string | null;
}

export type DevelopmentUnitStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "UNKNOWN";
export interface DevelopmentUnitRecord {
  id: string; unitNumber: string; building: string | null; section: string | null; floor: number | null; rooms: number | null; roomsLabel: string | null;
  area: number | null; price: number | null; pricePerSquareMeter: number | null; currency: "USD" | "EUR" | "UAH"; status: DevelopmentUnitStatus;
  renovationType: string | null; renovationCompletion: string | null; note: string | null; updatedAt: string;
}

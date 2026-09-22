export type DevelopmentConstructionStatus = "PLANNED" | "UNDER_CONSTRUCTION" | "COMPLETED" | "PAUSED";
export type DevelopmentSalesStatus = "EXPECTED" | "LAUNCH" | "OPEN" | "CLOSED";

export interface DevelopmentProjectRecord {
  id: string; developerId: string; slug: string; name: string; address: string | null; district: string | null; description: string | null;
  constructionStatus: DevelopmentConstructionStatus; salesStatus: DevelopmentSalesStatus; plannedCompletion: string | null; className: string | null;
  buildingsCount: number | null; sectionsCount: number | null; floors: string | null; imageUrl: string | null; sourceUrl: string | null;
  verifiedAt: string | null; createdAt: string; updatedAt: string;
}

export interface DevelopmentDeveloperRecord {
  id: string; slug: string; name: string; description: string | null; website: string | null; phone: string | null; email: string | null;
  logoUrl: string | null; sourceUrl: string | null; verifiedAt: string | null;
  projectCounts: { all: number; construction: number; completed: number; launch: number };
  projects?: DevelopmentProjectRecord[]; createdAt: string; updatedAt: string;
}

export interface CreateDevelopmentDeveloperRequest { name: string; description?: string | null; website?: string | null; phone?: string | null; email?: string | null; logoUrl?: string | null; sourceUrl?: string | null }
export interface CreateDevelopmentProjectRequest {
  name: string; address?: string | null; district?: string | null; description?: string | null; constructionStatus?: DevelopmentConstructionStatus;
  salesStatus?: DevelopmentSalesStatus; plannedCompletion?: string | null; className?: string | null; buildingsCount?: number | null;
  sectionsCount?: number | null; floors?: string | null; imageUrl?: string | null; sourceUrl?: string | null;
}

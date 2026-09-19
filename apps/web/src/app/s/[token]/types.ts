export type PublicSelectionItem = {
  id: string;
  title: string;
  subtitle: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  address: string | null;
  district: string | null;
  category: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL" | null;
  operation: "SALE" | "RENT" | null;
  area: number | null;
  rooms: string | null;
  floor: number | null;
  totalFloors: number | null;
  landArea: number | null;
  description: string | null;
  photos: Array<{ id: string; url: string }>;
};

export type PublicPropertySelectionShareRecord = {
  status: "AVAILABLE" | "OPENED" | "REVOKED" | "EXPIRED";
  organizationName: string;
  clientName: string | null;
  manager: { name: string; email: string; phone: string | null } | null;
  expiresAt: string;
  items: PublicSelectionItem[];
};

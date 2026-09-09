import type { AuthenticatedUser } from "@estate-crm/contracts";

export function hasOrganizationWideDataAccess(user: AuthenticatedUser): boolean {
  return user.organization.role === "ADMIN" || user.organization.role === "LEAD";
}

export function dataScope(user: AuthenticatedUser): {
  organizationId: string;
  assigneeId?: string;
} {
  return {
    organizationId: user.organization.id,
    ...(hasOrganizationWideDataAccess(user) ? {} : { assigneeId: user.id }),
  };
}

export function dealScope(user: AuthenticatedUser): {
  organizationId: string;
  OR?: Array<{ assigneeId: string } | { assigneeId: null; status: "ACTIVE" }>;
} {
  return {
    organizationId: user.organization.id,
    ...(hasOrganizationWideDataAccess(user) ? {} : { OR: [{ assigneeId: user.id }, { assigneeId: null, status: "ACTIVE" as const }] }),
  };
}

export function contactScope(user: AuthenticatedUser): {
  organizationId: string;
  OR?: Array<{ assigneeId: string } | { deals: { some: { status: "ACTIVE"; assigneeId: string | null } } }>;
} {
  return {
    organizationId: user.organization.id,
    ...(hasOrganizationWideDataAccess(user) ? {} : {
      OR: [
        { assigneeId: user.id },
        { deals: { some: { status: "ACTIVE" as const, assigneeId: user.id } } },
        { deals: { some: { status: "ACTIVE" as const, assigneeId: null } } },
      ],
    }),
  };
}

export function canAssignTo(user: AuthenticatedUser, assigneeId: string | null | undefined): boolean {
  return hasOrganizationWideDataAccess(user) || assigneeId == null || assigneeId === user.id;
}

export function effectiveAssigneeId(
  user: AuthenticatedUser,
  requestedAssigneeId: string | null | undefined,
): string | null {
  if (!hasOrganizationWideDataAccess(user)) return user.id;
  return requestedAssigneeId ?? null;
}

export function canConfigureOrganization(user: AuthenticatedUser): boolean {
  return user.organization.role === "ADMIN";
}

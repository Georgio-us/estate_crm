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

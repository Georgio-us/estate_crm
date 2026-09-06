export type DatabaseConfigurationState = "configured" | "missing";

export function getDatabaseConfigurationState(
  databaseUrl: string | undefined,
): DatabaseConfigurationState {
  return databaseUrl?.trim() ? "configured" : "missing";
}

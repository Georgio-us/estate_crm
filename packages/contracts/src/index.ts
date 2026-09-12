export interface HealthResponse {
  status: "ok";
  service: "estate-crm-api";
  version: string;
  timestamp: string;
  database: "connected";
}

export interface HealthErrorResponse {
  status: "error";
  service: "estate-crm-api";
  timestamp: string;
  database: "unavailable";
}

export type MembershipRole = "ADMIN" | "LEAD" | "MANAGER";

export interface AuthenticatedOrganization {
  id: string;
  name: string;
  slug: string;
  role: MembershipRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  organization: AuthenticatedOrganization;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionResponse {
  user: AuthenticatedUser;
}

export interface WorkspaceSettingsResponse {
  workspace: {
    name: string;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    timezone: string;
    currency: "USD" | "EUR";
  };
  profile: {
    name: string;
    email: string;
    phone: string | null;
  };
}

export interface UpdateWorkspaceSettingsRequest {
  name: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone: string;
  currency: "USD" | "EUR";
}

export interface UpdateProfileRequest {
  name: string;
  phone?: string | null;
}

export interface SessionRecord {
  id: string;
  current: boolean;
  device: string;
  browser: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface SessionListResponse {
  sessions: SessionRecord[];
}

export interface ApiErrorResponse {
  error: string;
  message: string;
}

export type TeamMemberStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export interface TeamDealSummary {
  id: string;
  number: number;
  title: string;
  request: string;
}

export interface TeamTaskSummary {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  contactName: string | null;
  dealId: string | null;
  dealNumber: number | null;
  dealTitle: string | null;
}

export interface TeamMemberRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: MembershipRole;
  status: TeamMemberStatus;
  joinedAt: string;
  updatedAt: string;
  pendingInvitationId: string | null;
  activeDeals: number;
  activeTasks: number;
  todayTasks: number;
  overdueTasks: number;
  deals: TeamDealSummary[];
  tasks: TeamTaskSummary[];
}

export interface TeamResponse {
  members: TeamMemberRecord[];
  total: number;
  active: number;
  scope: "ORGANIZATION" | "OWN_TEAM";
}

export interface TeamAssigneeListResponse {
  assignees: Array<{
    id: string;
    name: string;
    role: MembershipRole;
  }>;
}

export interface UpdateTeamMemberRequest {
  name?: string;
  phone?: string | null;
  role?: MembershipRole;
  status?: Extract<TeamMemberStatus, "ACTIVE" | "SUSPENDED">;
  confirmAssignedWork?: boolean;
}

export interface TeamAuditRecord {
  id: string;
  title: string;
  description: string | null;
  occurredAt: string;
  author: { id: string; name: string } | null;
}

export interface TeamAuditResponse {
  events: TeamAuditRecord[];
}

export interface CreateTeamInvitationRequest {
  name: string;
  email: string;
  role: Exclude<MembershipRole, "ADMIN">;
}

export interface TeamInvitationLinkResponse {
  invitationId: string;
  connectUrl: string;
  expiresAt: string;
}

export interface PublicTeamInvitationResponse {
  name: string;
  email: string;
  role: Exclude<MembershipRole, "ADMIN">;
  organizationName: string;
  expiresAt: string;
  existingAccount: boolean;
}

export interface AcceptTeamInvitationRequest {
  password: string;
}

export type TelegramNotificationAudience = "ALL" | "OWN" | "SELECTED" | "NONE";

export interface TelegramNotificationPreferencesResponse {
  connected: boolean;
  role: MembershipRole;
  audience: TelegramNotificationAudience;
  leadNotifications: boolean;
  taskReminderNotifications: boolean;
  taskOverdueNotifications: boolean;
  selectedUserIds: string[];
  members: Array<{ id: string; name: string; role: MembershipRole }>;
}

export interface UpdateTelegramNotificationPreferencesRequest {
  audience: TelegramNotificationAudience;
  leadNotifications: boolean;
  taskReminderNotifications: boolean;
  taskOverdueNotifications: boolean;
  selectedUserIds: string[];
}

export type ContactSource = "META" | "WEBSITE" | "MANUAL";

export interface ContactAssignee {
  id: string;
  name: string;
}

export interface ContactDealSummary {
  id: string;
  number: number;
  title: string;
  request: string;
  budget: string | null;
  stage: { id: string; title: string; color: string };
}

export interface ContactRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  source: ContactSource;
  assignee: ContactAssignee | null;
  dealIds: string[];
  deals: ContactDealSummary[];
  relatedContacts: Array<ContactAssignee & { phone: string | null; label: string | null }>;
  nextTask: { id: string; title: string; dueDate: string | null; dueTime: string | null } | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListResponse {
  contacts: ContactRecord[];
  total: number;
}

export interface CreateContactRequest {
  name: string;
  phone?: string;
  email?: string;
  telegram?: string;
  source?: ContactSource;
  assigneeId?: string | null;
  comment?: string;
}

export interface UpdateContactRequest {
  name?: string;
  phone?: string | null;
  email?: string | null;
  telegram?: string | null;
  source?: ContactSource;
  assigneeId?: string | null;
  comment?: string | null;
}

export interface LinkContactRequest {
  relatedContactId: string;
  label?: string;
}

export type DealOperation = "PURCHASE" | "RENT" | "SALE";
export type DealStatus = "ACTIVE" | "WON" | "LOST" | "ARCHIVED";
export type DealMarketPreference = "PRIMARY" | "SECONDARY";
export type DealPaymentMethod = "FULL" | "INSTALLMENT";
export type DealPropertySelectionStatus = "CANDIDATE" | "OFFERED";

export interface PipelineDealRecord {
  id: string;
  number: number;
  contact: ContactAssignee & { phone: string | null };
  relatedContacts: Array<ContactAssignee & { phone: string | null }>;
  nextTask: { id: string; title: string; dueDate: string | null; dueTime: string | null } | null;
  title: string;
  request: string;
  budget: string | null;
  operation: DealOperation;
  propertyType: string | null;
  district: string | null;
  rooms: string | null;
  marketPreference: DealMarketPreference | null;
  paymentMethod: DealPaymentMethod | null;
  neighborhood: string | null;
  preferredProject: string | null;
  source: ContactSource;
  status: DealStatus;
  assignee: ContactAssignee | null;
  comment: string | null;
  position: number;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkDealContactRequest {
  contactId: string;
}

export interface PipelineStageRecord {
  id: string;
  title: string;
  color: string;
  position: number;
  deals: PipelineDealRecord[];
}

export interface PipelineResponse {
  pipeline: {
    id: string;
    name: string;
    stages: PipelineStageRecord[];
  };
}

export interface PipelineStageConfiguration {
  id: string;
  title: string;
  color: string;
  position: number;
  dealCount: number;
}

export interface PipelineConfigurationResponse {
  pipeline: {
    id: string;
    name: string;
    stages: PipelineStageConfiguration[];
  };
}

export interface UpdatePipelineConfigurationRequest {
  stages: Array<{
    id?: string;
    title: string;
    color: string;
  }>;
}

export interface CreateDealRequest {
  stageId: string;
  contactId?: string;
  contactName?: string;
  phone?: string;
  assigneeId?: string | null;
  title?: string;
  request?: string;
  budget?: string;
  operation?: DealOperation;
  propertyType?: string;
  district?: string;
  rooms?: string;
  marketPreference?: DealMarketPreference;
  paymentMethod?: DealPaymentMethod;
  neighborhood?: string;
  preferredProject?: string;
  source?: ContactSource;
  comment?: string;
}

export interface UpdateDealRequest {
  stageId?: string;
  assigneeId?: string | null;
  title?: string;
  request?: string;
  budget?: string | null;
  operation?: DealOperation;
  propertyType?: string | null;
  district?: string | null;
  rooms?: string | null;
  marketPreference?: DealMarketPreference | null;
  paymentMethod?: DealPaymentMethod | null;
  neighborhood?: string | null;
  preferredProject?: string | null;
  source?: ContactSource;
  comment?: string | null;
}

export interface MoveDealRequest {
  stageId: string;
  position?: number;
}

export interface UpdateDealLifecycleRequest {
  status: DealStatus;
}

export interface DealPropertySelectionRecord {
  id: string;
  dealId: string;
  propertyId: string | null;
  catalogKey: string;
  status: DealPropertySelectionStatus;
  title: string;
  subtitle: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealPropertySelectionRequest {
  propertyId?: string | null;
  catalogKey: string;
  title: string;
  subtitle?: string | null;
  priceLabel?: string | null;
  imageUrl?: string | null;
}

export interface UpdateDealPropertySelectionRequest {
  status: DealPropertySelectionStatus;
}

export type TaskKind = "CALL" | "MEETING" | "MESSAGE" | "OTHER";
export type TaskStatus = "ACTIVE" | "COMPLETED";

export interface TaskRecord {
  id: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  dueDate: string | null;
  dueTime: string | null;
  result: string | null;
  completedAt: string | null;
  contact: ContactAssignee | null;
  deal: { id: string; number: number; title: string } | null;
  assignee: ContactAssignee | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  tasks: TaskRecord[];
  total: number;
}

export interface CreateTaskRequest {
  title: string;
  kind?: TaskKind;
  dueDate?: string | null;
  dueTime?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  assigneeId?: string | null;
}

export interface UpdateTaskRequest extends CreateTaskRequest {
  status?: TaskStatus;
  result?: string | null;
}

export interface CompleteTaskRequest {
  result?: string;
}

export type PropertyCategory = "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL";
export type PropertyMarket = "PRIMARY" | "SECONDARY";
export type PropertyOperation = "SALE" | "RENT";
export type PropertyStatus = "AVAILABLE" | "RESERVED" | "SOLD";
export type Currency = "USD" | "EUR";

export interface PropertyRecord {
  id: string;
  code: string;
  title: string;
  address: string | null;
  district: string | null;
  category: PropertyCategory;
  market: PropertyMarket;
  operation: PropertyOperation;
  status: PropertyStatus;
  price: number;
  currency: Currency;
  rooms: string | null;
  area: number;
  floor: number | null;
  totalFloors: number | null;
  landArea: number | null;
  project: string | null;
  developer: string | null;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyListResponse {
  properties: PropertyRecord[];
  total: number;
}

export interface CreatePropertyRequest {
  title: string;
  address?: string | null;
  district?: string | null;
  category: PropertyCategory;
  market: PropertyMarket;
  operation?: PropertyOperation;
  status?: PropertyStatus;
  price?: number;
  currency?: Currency;
  rooms?: string | null;
  area?: number;
  floor?: number | null;
  totalFloors?: number | null;
  landArea?: number | null;
  project?: string | null;
  developer?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export type UpdatePropertyRequest = Partial<CreatePropertyRequest>;

export interface DashboardResponse {
  deals: {
    total: number;
    unassigned: number;
    withoutTask: number;
  };
  contacts: { total: number };
  properties: { available: number };
  stages: Array<{ id: string; title: string; color: string; position: number; dealCount: number }>;
  activities: Array<ActivityEventRecord & {
    contactName: string | null;
    dealNumber: number | null;
    dealTitle: string | null;
  }>;
}

export type ActivityCategory = "NOTE" | "TASK" | "CHANGE" | "SOURCE" | "OBJECT";

export interface ActivityEventRecord {
  id: string;
  contactId: string | null;
  dealId: string | null;
  category: ActivityCategory;
  title: string;
  description: string | null;
  author: ContactAssignee | null;
  occurredAt: string;
}

export interface ActivityListResponse {
  activities: ActivityEventRecord[];
}

export interface CreateNoteRequest {
  text: string;
}

export type IntegrationProvider = "TEST" | "META_LEAD_ADS" | "INSTAGRAM_DIRECT" | "TELEPHONY" | "TELEGRAM";
export type IntegrationConnectionStatus = "READY" | "CREDENTIALS_REQUIRED" | "CONNECTED" | "ERROR";
export type IntegrationEventStatus = "RECEIVED" | "PROCESSED" | "DUPLICATE" | "FAILED";

export interface IntegrationConnectionRecord {
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  enabled: boolean;
  pipelineId: string | null;
  stageId: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  processedCount: number;
  webhookConfigured: boolean;
}

export interface GoogleSheetsIntegrationSetupResponse {
  connectionId: string;
  webhookUrl: string;
  secret: string;
}

export interface TelegramIntegrationSetupResponse {
  connectUrl: string;
  expiresAt: string;
}

export interface GoogleSheetsMetaLeadRequest {
  externalId: string;
  name: string;
  phone: string;
  message?: string;
  createdAt?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface IntegrationEventRecord {
  id: string;
  provider: IntegrationProvider;
  externalId: string;
  eventType: string;
  status: IntegrationEventStatus;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
  dealNumber: number | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface IntegrationsResponse {
  connections: IntegrationConnectionRecord[];
  events: IntegrationEventRecord[];
  pendingNotifications: number;
}

export interface TestInboundLeadRequest {
  provider: "META_LEAD_ADS" | "INSTAGRAM_DIRECT" | "TELEPHONY" | "TEST";
  externalId?: string;
  name: string;
  phone: string;
  message?: string;
}

export interface UpdateIntegrationConnectionRequest {
  pipelineId: string;
  stageId: string;
}

export interface InboundLeadResult {
  eventId: string;
  contactId: string;
  dealId: string;
  dealNumber: number;
  duplicate: boolean;
  reusedContact: boolean;
  reusedDeal: boolean;
  notificationQueued: boolean;
}

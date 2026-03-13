import type { TicketStatus } from '../constants/ticketStatus';
export type { TicketStatus } from '../constants/ticketStatus';

export type ViewState = 'landing' | 'login' | 'home' | 'inbox' | 'users' | 'kpi' | 'settings' | 'tracking' | 'public-form' | 'approvals' | 'finance' | 'email-health' | 'audit-logs';

export interface InboxFilter {
  status: string[];
  priority: string[];
  region: string[];
  site: string[];
  type: string[];
}

export interface HistoryItem {
  id: string;
  type: 'customer' | 'system' | 'tech' | 'field_change';
  sender?: string;
  time: Date;
  text?: string;
  field?: string;
  from?: string;
  to?: string;
}

export interface TicketAttachment {
  id: string;
  name: string;
  path: string;
  url: string;
  contentType?: string | null;
  size?: number | null;
  uploadedAt?: Date | null;
  category?: 'closure_report' | 'closure_evidence' | 'attachment';
}

export interface SLAStatus {
  dueAt: Date;
  status: 'on_time' | 'at_risk' | 'overdue';
}

export interface PreliminaryActions {
  materialRequested: boolean;
  materialEta?: Date | null;
  teamConfirmed: boolean;
  sitePrepared: boolean;
  scheduleDefined: boolean;
  stakeholderAligned: boolean;
  accessReleased: boolean;
  plannedStartAt?: Date | null;
  actualStartAt?: Date | null;
  blockerNotes?: string;
  updatedAt?: Date | null;
}

export interface ClosureChecklist {
  requesterApproved: boolean;
  requesterApprovedBy?: string | null;
  requesterApprovedAt?: Date | null;
  infrastructureApprovalPrimary: boolean;
  infrastructureApprovalSecondary: boolean;
  infrastructureApprovedByRafael?: boolean;
  infrastructureApprovedByFernando?: boolean;
  closureNotes?: string;
  serviceStartedAt?: Date | null;
  serviceCompletedAt?: Date | null;
  closedAt?: Date | null;
  documents?: TicketAttachment[];
}

export interface GuaranteeInfo {
  startAt?: Date | null;
  endAt?: Date | null;
  months: number;
  status: 'pending' | 'active' | 'expired';
}

export interface ExecutionProgress {
  paymentFlowParts: number;
  currentPercent: number;
  releasedPercent: number;
  measurementSheetUrl?: string | null;
  startedAt?: Date | null;
  lastUpdatedAt?: Date | null;
}

export interface QuoteProposalHeader {
  unitName?: string | null;
  location?: string | null;
  folderLink?: string | null;
  contractedVendor?: string | null;
  totalQuantity?: string | null;
  totalEstimatedValue?: string | null;
}

export interface Ticket {
  id: string;
  trackingToken: string;
  subject: string;
  requester: string;
  requesterEmail?: string;
  time: Date;
  status: TicketStatus;
  type: string;
  macroServiceId?: string;
  macroServiceName?: string;
  serviceCatalogId?: string;
  serviceCatalogName?: string;
  regionId?: string;
  region: string;
  siteId?: string;
  sede: string;
  assignedTeam?: string;
  assignedEmail?: string;
  sector: string;
  priority: string;
  history: HistoryItem[];
  viewingBy?: { name: string; at: Date } | null;
  sla?: SLAStatus;
  preliminaryActions?: PreliminaryActions;
  closureChecklist?: ClosureChecklist;
  attachments?: TicketAttachment[];
  guarantee?: GuaranteeInfo;
  executionProgress?: ExecutionProgress;
}

export interface QuoteItem {
  id: string;
  section?: string | null;
  description: string;
  materialId?: string | null;
  materialName?: string | null;
  unit?: string | null;
  quantity?: number | null;
  costUnitPrice?: string | null;
  unitPrice?: string | null;
  totalPrice?: string | null;
}

export interface Quote {
  id: number | string;
  vendor: string;
  value: string;
  laborValue?: string | null;
  materialValue?: string | null;
  totalValue?: string | null;
  category?: 'initial' | 'additive';
  additiveIndex?: number | null;
  additiveReason?: string | null;
  recommended: boolean;
  status?: string;
  attachmentName?: string | null;
  proposalHeader?: QuoteProposalHeader | null;
  items?: QuoteItem[];
  classification?: ProcurementClassificationSnapshot;
}

export interface ContractRecord {
  id: string;
  vendor: string;
  value: string;
  initialPlannedValue?: string | null;
  realizedValue?: string | null;
  status: string;
  viewingBy?: string | null;
  signedFileName?: string | null;
  items?: QuoteItem[];
  classification?: ProcurementClassificationSnapshot;
}

export interface MeasurementRecord {
  id: string;
  label: string;
  progressPercent: number;
  releasePercent: number;
  grossValue?: string | null;
  status: 'pending' | 'approved' | 'paid';
  notes?: string;
  requestedAt?: Date | null;
  approvedAt?: Date | null;
  classification?: ProcurementClassificationSnapshot;
}

export interface PaymentRecord {
  id: string;
  vendor: string;
  value: string;
  grossValue?: string | null;
  taxValue?: string | null;
  netValue?: string | null;
  progressPercent?: number | null;
  expectedBaselineValue?: string | null;
  status: string;
  label?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  dueAt?: Date | null;
  measurementId?: string | null;
  releasedPercent?: number | null;
  milestonePercent?: number | null;
  receiptFileName?: string | null;
  attachments?: TicketAttachment[];
  paidAt?: Date | null;
  classification?: ProcurementClassificationSnapshot;
}

export interface ProcurementClassificationSnapshot {
  ticketType?: string | null;
  macroServiceId?: string | null;
  macroServiceName?: string | null;
  serviceCatalogId?: string | null;
  serviceCatalogName?: string | null;
  regionId?: string | null;
  regionName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  sector?: string | null;
}

export interface User {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'Ativo' | 'Inativo';
}

export interface AppNotification {
  id: string;
  type: 'info' | 'actionable' | 'alert';
  title: string;
  body: string;
  time: Date;
  read: boolean;
  action?: {
    label: string;
    view: ViewState;
    ticketId?: string;
  };
}

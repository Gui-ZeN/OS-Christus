import type { TicketStatus } from '../constants/ticketStatus';
export type { TicketStatus } from '../constants/ticketStatus';

export type ViewState = 'landing' | 'login' | 'home' | 'inbox' | 'users' | 'kpi' | 'settings' | 'tracking' | 'public-form' | 'approvals' | 'finance' | 'email-health' | 'audit-logs';

export interface InboxFilter {
  status: string[];
  priority: string[];
  region: string[];
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
  infrastructureApprovedByRafael: boolean;
  infrastructureApprovedByFernando: boolean;
  closureNotes?: string;
  serviceStartedAt?: Date | null;
  serviceCompletedAt?: Date | null;
  closedAt?: Date | null;
}

export interface GuaranteeInfo {
  startAt?: Date | null;
  endAt?: Date | null;
  months: number;
  status: 'pending' | 'active' | 'expired';
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
  regionId?: string;
  region: string;
  siteId?: string;
  sede: string;
  sector: string;
  priority: string;
  history: HistoryItem[];
  viewingBy?: { name: string; at: Date } | null;
  sla?: SLAStatus;
  preliminaryActions?: PreliminaryActions;
  closureChecklist?: ClosureChecklist;
  guarantee?: GuaranteeInfo;
}

export interface Quote {
  id: number | string;
  vendor: string;
  value: string;
  recommended: boolean;
  status?: string;
  attachmentName?: string | null;
}

export interface ContractRecord {
  id: string;
  vendor: string;
  value: string;
  status: string;
  viewingBy?: string | null;
  signedFileName?: string | null;
}

export interface MeasurementRecord {
  id: string;
  label: string;
  progressPercent: number;
  releasePercent: number;
  status: 'pending' | 'approved' | 'paid';
  notes?: string;
  requestedAt?: Date | null;
  approvedAt?: Date | null;
}

export interface PaymentRecord {
  id: string;
  vendor: string;
  value: string;
  status: string;
  label?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  dueAt?: Date | null;
  measurementId?: string | null;
  releasedPercent?: number | null;
  receiptFileName?: string | null;
  paidAt?: Date | null;
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

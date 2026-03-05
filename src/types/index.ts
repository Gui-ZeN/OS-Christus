import type { TicketStatus } from '../constants/ticketStatus';
export type { TicketStatus } from '../constants/ticketStatus';

export type ViewState = 'landing' | 'login' | 'home' | 'inbox' | 'users' | 'kpi' | 'settings' | 'tracking' | 'public-form' | 'approvals' | 'finance' | 'email-health';

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

export interface Ticket {
  id: string;
  trackingToken: string;
  subject: string;
  requester: string;
  requesterEmail?: string;
  time: Date;
  status: TicketStatus;
  type: string;
  region: string;
  sede: string;
  sector: string;
  priority: string;
  history: HistoryItem[];
  viewingBy?: { name: string; at: Date } | null;
  sla?: SLAStatus;
}

export interface Quote {
  id: number;
  vendor: string;
  value: string;
  recommended: boolean;
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

export type ViewState = 'login' | 'home' | 'inbox' | 'users' | 'kpi' | 'settings' | 'tracking' | 'public-form' | 'approvals' | 'finance';

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
  time: Date;
  status: string;
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

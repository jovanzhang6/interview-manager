import type { Stage } from './stages';

export { STAGE_NAMES } from './stages';
export type { Stage, StageName, StageStatus, StageType, StageDefinition, StageDraft } from './stages';

export interface Interview {
  id: string;
  userId?: number;
  username?: string;
  company: string;
  position: string;
  stages: Stage[];
  status: 'active' | 'archived';
  url?: string;
  lastVisitedAt?: string;
  /** 公司维度置顶（同公司任一记录置顶即整体置顶） */
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  createdAt?: string;
  interviewCount?: number;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

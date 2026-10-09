import type { Interview, User, AuthResponse, StageDefinition } from './types';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const hasBody = options?.body !== undefined;
  
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {})
  };
  
  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('登录已过期');
  }
  
  if (!res.ok) {
    let message = '请求失败';
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {}
    throw new Error(message);
  }
  
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// Auth
export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export function getMe(): Promise<{ success: boolean; user: User }> {
  return request(`${BASE}/auth/me`);
}

export function changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean }> {
  return request(`${BASE}/auth/password`, {
    method: 'PUT',
    body: JSON.stringify({ oldPassword, newPassword })
  });
}

// Interviews
export function fetchInterviews(): Promise<Interview[]> {
  return request<Interview[]>(`${BASE}/interviews`);
}

export function createInterview(company: string, position: string, url?: string, stages?: StageDefinition[]): Promise<Interview> {
  return request<Interview>(`${BASE}/interviews`, {
    method: 'POST',
    body: JSON.stringify({ company, position, url, stages })
  });
}

export function updateStage(id: string, stageIndex: number, status: string): Promise<Interview> {
  return request<Interview>(`${BASE}/interviews/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stageIndex, status })
  });
}

export function deleteInterview(id: string): Promise<void> {
  return request<void>(`${BASE}/interviews/${id}`, { method: 'DELETE' });
}

export function recordVisit(id: string): Promise<{ id: string; lastVisitedAt: string }> {
  return request<{ id: string; lastVisitedAt: string }>(`${BASE}/interviews/${id}/visit`, {
    method: 'POST'
  });
}

export function visitCompany(company: string): Promise<{ success: boolean; updated: number; lastVisitedAt: string }> {
  return request(`${BASE}/interviews/visit-company`, {
    method: 'POST',
    body: JSON.stringify({ company })
  });
}

export function pinCompany(company: string, pinned: boolean): Promise<{ success: boolean; updated: number; pinned: boolean }> {
  return request(`${BASE}/interviews/pin-company`, {
    method: 'PUT',
    body: JSON.stringify({ company, pinned })
  });
}

export function updateInterview(id: string, company: string, position: string, url?: string, stages?: StageDefinition[]): Promise<Interview> {
  return request<Interview>(`${BASE}/interviews/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ company, position, url, stages })
  });
}

export function exportInterviews(): Promise<Interview[]> {
  return request<Interview[]>(`${BASE}/interviews/export`);
}

export function importInterviews(data: Interview[], mode: string = 'merge'): Promise<{ success: boolean; count: number }> {
  return request<{ success: boolean; count: number }>(`${BASE}/interviews/import`, {
    method: 'POST',
    body: JSON.stringify({ data, mode })
  });
}

// Admin
export function getUsers(): Promise<{ success: boolean; users: User[] }> {
  return request(`${BASE}/auth/users`);
}

export function deleteUser(id: number): Promise<void> {
  return request<void>(`${BASE}/auth/users/${id}`, { method: 'DELETE' });
}

export function updateUserRole(id: number, role: string): Promise<void> {
  return request<void>(`${BASE}/auth/users/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role })
  });
}

export function getAllInterviews(): Promise<Interview[]> {
  return request<Interview[]>(`${BASE}/interviews/admin/all`);
}

export function getStats(): Promise<{ stats: any }> {
  return request(`${BASE}/interviews/admin/stats`);
}

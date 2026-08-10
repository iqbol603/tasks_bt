const API_BASE = '/api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: string;
  department?: string | null;
  departmentId?: string | null;
}

export interface Department {
  id: string;
  name: string;
  _count?: { users: number };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

class ApiClient {
  private accessToken: string | null = localStorage.getItem('accessToken');
  private refreshToken: string | null = localStorage.getItem('refreshToken');

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  getAccessToken() {
    return this.accessToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401 && this.refreshToken && !path.includes('/auth/')) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Ошибка запроса' }));
      throw new Error(err.error ?? 'Ошибка запроса');
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  logout() {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
  }

  me() {
    return this.request<User>('/auth/me');
  }

  getDashboard() {
    return this.request('/dashboard');
  }

  getProjects(status?: string) {
    const q = status ? `?status=${status}` : '';
    return this.request(`/projects${q}`);
  }

  updateProject(id: string, data: Record<string, unknown>) {
    return this.request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  archiveProject(id: string) {
    return this.request(`/projects/${id}/archive`, { method: 'PATCH' });
  }

  unarchiveProject(id: string) {
    return this.request(`/projects/${id}/unarchive`, { method: 'PATCH' });
  }

  deleteProject(id: string) {
    return this.request(`/projects/${id}`, { method: 'DELETE' });
  }

  getProjectTags(projectId: string) {
    return this.request(`/projects/${projectId}/tags`);
  }

  createTag(projectId: string, name: string, color?: string) {
    return this.request(`/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  }

  getProject(id: string) {
    return this.request(`/projects/${id}`);
  }

  createProject(data: { name: string; description?: string; color?: string }) {
    return this.request('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  getTasks(params?: Record<string, string>) {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return this.request(`/tasks${query}`);
  }

  getKanban(projectId: string, filters?: Record<string, string>) {
    const params = new URLSearchParams({ projectId, ...filters });
    return this.request(`/tasks/kanban?${params}`);
  }

  getCalendarTasks(from: string, to: string) {
    return this.request(`/tasks/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  getTask(id: string) {
    return this.request(`/tasks/${id}`);
  }

  createTask(data: Record<string, unknown>) {
    return this.request('/tasks', { method: 'POST', body: JSON.stringify(data) });
  }

  updateTask(id: string, data: Record<string, unknown>) {
    return this.request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  deleteTask(id: string) {
    return this.request(`/tasks/${id}`, { method: 'DELETE' });
  }

  approveSubtaskAssignment(id: string, approve: boolean) {
    return this.request(`/tasks/${id}/approve-assignment`, {
      method: 'PATCH',
      body: JSON.stringify({ approve }),
    });
  }

  getUsers() {
    return this.request<User[]>('/users');
  }

  getTeam() {
    return this.request('/users');
  }

  createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    department?: string;
    departmentId?: string | null;
  }) {
    return this.request('/users', { method: 'POST', body: JSON.stringify(data) });
  }

  updateUser(id: string, data: Record<string, unknown>) {
    return this.request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  getDepartments() {
    return this.request<Department[]>('/departments');
  }

  createDepartment(name: string) {
    return this.request<Department>('/departments', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  updateDepartment(id: string, name: string) {
    return this.request<Department>(`/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  deleteDepartment(id: string) {
    return this.request(`/departments/${id}`, { method: 'DELETE' });
  }

  deactivateUser(id: string) {
    return this.request(`/users/${id}/deactivate`, { method: 'POST' });
  }

  activateUser(id: string) {
    return this.request(`/users/${id}/activate`, { method: 'POST' });
  }

  deleteUser(id: string) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  }

  getNotifications() {
    return this.request('/notifications');
  }

  markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  postComment(taskId: string, content: string, mentionIds?: string[]) {
    return this.request('/comments', {
      method: 'POST',
      body: JSON.stringify({ taskId, content, mentionIds }),
    });
  }

  getIntegrations() {
    return this.request('/settings/integrations');
  }

  getTelegramStatus() {
    return this.request('/settings/telegram');
  }

  generateTelegramLinkCode() {
    return this.request('/settings/telegram/link-code', { method: 'POST', body: '{}' });
  }

  unlinkTelegram() {
    return this.request('/settings/telegram', { method: 'DELETE' });
  }

  getFilePreviewUrl(fileId: string) {
    return `/api/files/${fileId}/preview`;
  }

  uploadFile(taskId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('taskId', taskId);
    return this.request('/files/upload', { method: 'POST', body: form });
  }

  addWatcher(taskId: string, userId: string) {
    return this.request(`/tasks/${taskId}/watchers`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  removeWatcher(taskId: string, userId: string) {
    return this.request(`/tasks/${taskId}/watchers/${userId}`, { method: 'DELETE' });
  }

  addTaskTag(taskId: string, tagId: string) {
    return this.request(`/tasks/${taskId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tagId }),
    });
  }

  removeTaskTag(taskId: string, tagId: string) {
    return this.request(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' });
  }

  toggleChecklist(taskId: string, checklistId: string, isDone: boolean) {
    return this.request(`/tasks/${taskId}/checklists/${checklistId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone }),
    });
  }

  addChecklistItem(taskId: string, title: string) {
    return this.request(`/tasks/${taskId}/checklists`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  getReportSummary() {
    return this.request('/reports/summary');
  }

  getTaskTime(taskId: string) {
    return this.request(`/time/task/${taskId}`);
  }

  getActiveTimer() {
    return this.request('/time/active');
  }

  startTimer(taskId: string) {
    return this.request(`/time/task/${taskId}/start`, { method: 'POST', body: '{}' });
  }

  stopTimer(taskId: string) {
    return this.request(`/time/task/${taskId}/stop`, { method: 'POST', body: '{}' });
  }

  getEmployeeAnalytics() {
    return this.request('/analytics/employees');
  }

  getEmployeeDetail(id: string) {
    return this.request(`/analytics/employees/${id}`);
  }

  getReviewQueue() {
    return this.request('/analytics/review-queue');
  }

  getMyDailyReport(date?: string) {
    const q = date ? `?date=${date}` : '';
    return this.request(`/daily-reports/my${q}`);
  }

  getDailyReports(date?: string, userId?: string) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (userId) params.set('userId', userId);
    const q = params.toString() ? `?${params}` : '';
    return this.request(`/daily-reports${q}`);
  }

  getDailyReportHistory(userId?: string, days = 14) {
    const params = new URLSearchParams({ days: String(days) });
    if (userId) params.set('userId', userId);
    return this.request(`/daily-reports/history?${params}`);
  }

  saveDailyReport(content: string, reportDate?: string) {
    return this.request('/daily-reports', {
      method: 'POST',
      body: JSON.stringify({ content, reportDate }),
    });
  }
}

export const api = new ApiClient();

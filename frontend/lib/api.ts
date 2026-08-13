/**
 * lib/api.ts
 * ──────────
 * Central HTTP client that talks to the FastAPI backend at localhost:8000.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  let body: any;
  try { body = await res.json(); } catch { body = {}; }

  if (!res.ok) {
    const message =
      typeof body?.detail === "string" ? body.detail
      : Array.isArray(body?.detail)   ? body.detail.map((d: any) => d.msg).join(", ")
      : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackendUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  plan: string;
  is_active: boolean;
  email_verified: boolean;
  avatar?: string | null;
  created_at?: string;
  last_login?: string | null;
  conversions_used_this_month: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiRegister(p: { full_name: string; email: string; password: string }) {
  return request<{ message: string; user: BackendUser }>("/register", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiLogin(p: { email: string; password: string }) {
  return request<{ message: string; user: BackendUser }>("/login", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiGoogleLogin(credential: string) {
  return request<{ message: string; user: BackendUser; projects?: any[]; quick_history?: any[]; needs_password_setup?: boolean }>("/auth/google", {
    method: "POST", body: JSON.stringify({ credential }),
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function apiGetUser(userId: number) {
  return request<BackendUser>(`/user/${userId}`);
}

export async function apiUpdateProfile(userId: number, p: { full_name?: string; avatar?: string }) {
  return request<{ message: string; user: BackendUser }>(`/user/${userId}/profile`, {
    method: "PUT", body: JSON.stringify(p),
  });
}

export async function apiUpdatePlan(userId: number, plan: "free" | "pro") {
  return request<{ message: string; user: BackendUser }>(`/user/${userId}/plan`, {
    method: "PUT", body: JSON.stringify({ plan }),
  });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface BackendProject {
  id: string;
  user_id: number;
  name: string;
  description: string;
  db_type: string;
  files: unknown[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export async function apiSaveProject(p: {
  user_id: number; id: string; name: string;
  description?: string; db_type: string; files: unknown[]; pinned?: boolean;
}) {
  return request<{ message: string; id: string }>("/projects", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiGetProjects(userId: number) {
  return request<BackendProject[]>(`/projects/${userId}`);
}

export async function apiDeleteProject(userId: number, projectUid: string) {
  return request<{ message: string }>(`/projects/${userId}/${projectUid}`, { method: "DELETE" });
}

export async function apiDeactivateAccount(userId: number) {
  return request<{ message: string }>(`/user/${userId}/deactivate`, { method: "DELETE" });
}

export async function apiDeleteAccount(userId: number) {
  return request<{ message: string }>(`/user/${userId}`, { method: "DELETE" });
}

// ─── Quick History ────────────────────────────────────────────────────────────

export interface BackendQuickEntry {
  id: string; filename: string; sql: string;
  stats: { tables: number; relationships: number; attributes: number };
  processingTime: number; timestamp: number; imageUrl: string;
}

export async function apiSaveQuickHistory(p: {
  user_id: number; id: string; filename: string;
  sql: string; stats: object; processingTime: number;
}) {
  return request<{ message: string }>("/quick-history", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiGetQuickHistory(userId: number) {
  return request<BackendQuickEntry[]>(`/quick-history/${userId}`);
}

export async function apiClearQuickHistory(userId: number) {
  return request<{ message: string }>(`/quick-history/${userId}`, { method: "DELETE" });
}

// ─── Conversions / exports ────────────────────────────────────────────────────

export async function apiIncrementConversions(userId: number) {
  return request<{ conversions_used_this_month: number }>(`/increment-conversions/${userId}`, {
    method: "POST",
  });
}

export async function apiSaveConversion(p: {
  user_id: number; image_id?: number | null; generated_ddl: string; dialect: string;
  success: boolean; error_message?: string; execution_time_ms?: number;
  tables_count?: number; relationships_count?: number; tool?: string;
}) {
  return request<{ message: string; conversion_id: number }>("/save-conversion", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiLogExport(p: {
  user_id: number; conversion_id?: number; format: "sql" | "txt" | "json" | "copy";
}) {
  return request<{ message: string }>("/log-export", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiGetUsers() {
  return request<BackendUser[]>("/users");
}

// ─── Tool History ─────────────────────────────────────────────────────────────

export interface BackendToolHistory {
  id: string;
  tool: "quick_convert" | "generate" | "migrate";
  action_label: string;
  result_sql: string;
  dialect_from: string | null;
  dialect_to: string | null;
  tables_count: number;
  processing_time_ms: number;
  success: boolean;
  extra_json: Record<string, unknown>;
  created_at: number; // ms timestamp
}

export async function apiSaveToolHistory(p: {
  user_id: number;
  tool: string;
  action_label: string;
  result_sql?: string;
  dialect_from?: string;
  dialect_to?: string;
  tables_count?: number;
  processing_time_ms?: number;
  success?: boolean;
  extra_json?: object;
}) {
  return request<{ message: string; id: string }>("/tool-history", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export async function apiGetToolHistory(userId: number) {
  return request<BackendToolHistory[]>(`/tool-history/${userId}`);
}

export async function apiDeleteToolHistoryEntry(userId: number, entryId: string) {
  return request<{ message: string }>(`/tool-history/${userId}/${entryId}`, { method: "DELETE" });
}

export async function apiClearToolHistory(userId: number) {
  return request<{ message: string }>(`/tool-history/${userId}`, { method: "DELETE" });
}
export async function apiGetActivity(userId: number) {
  return request<{ id: number; activity_type: string; description: string; timestamp: string }[]>(
    `/activity/${userId}`
  );
}

/** POST /upload-image — multipart */
export async function apiUploadImage(userId: number, file: File) {
  const form = new FormData();
  form.append("user_id", String(userId));
  form.append("image", file);
  const res = await fetch(`${BASE_URL}/upload-image`, { method: "POST", body: form });
  let body: any;
  try { body = await res.json(); } catch { body = {}; }
  if (!res.ok) throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  return body as { message: string; image_id: number; filename: string; status: string };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface AdminUserRecord {
  id: number;
  full_name: string;
  email: string;
  role: string;
  plan: string;
  is_active: boolean;
  email_verified: boolean;
  avatar?: string | null;
  created_at?: string;
  last_login?: string | null;
  conversions_used_this_month: number;
  project_count: number;
  conversion_count: number;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  suspended_users: number;
  pro_users: number;
  free_users: number;
  total_projects: number;
  total_conversions: number;
  successful_conversions: number;
  failed_conversions: number;
  recently_active_users: number;
}

export async function apiAdminGetUsers() {
  return request<AdminUserRecord[]>("/admin/users");
}

export async function apiAdminGetStats() {
  return request<AdminStats>("/admin/stats");
}

export async function apiAdminSuspendUser(userId: number, suspend: boolean) {
  return request<{ message: string; user: BackendUser }>(`/admin/users/${userId}/suspend`, {
    method: "PUT", body: JSON.stringify({ suspend }),
  });
}

export async function apiAdminChangePlan(userId: number, plan: "free" | "pro") {
  return request<{ message: string; user: BackendUser }>(`/admin/users/${userId}/plan`, {
    method: "PUT", body: JSON.stringify({ plan }),
  });
}

export async function apiAdminChangeRole(userId: number, role: "user" | "admin") {
  return request<{ message: string; user: BackendUser }>(`/admin/users/${userId}/role`, {
    method: "PUT", body: JSON.stringify({ role }),
  });
}

export async function apiAdminResetConversions(userId: number) {
  return request<{ message: string; user: BackendUser }>(`/admin/users/${userId}/reset-conversions`, {
    method: "PUT",
  });
}

export async function apiAdminDeleteUser(userId: number) {
  return request<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" });
}

export async function apiAdminGetUserProjects(userId: number) {
  return request<BackendProject[]>(`/admin/users/${userId}/projects`);
}

export async function apiAdminGetUserProjectImages(userId: number) {
  return request<{
    id: number; image_uid: string; original_filename: string;
    project_name: string; project_uid: string; status: string;
    tables_count: number; relationships_count: number;
    processing_time_ms?: number | null; generated_sql?: string | null;
    uploaded_at: string; completed_at?: string | null;
  }[]>(`/admin/users/${userId}/project-images`);
}

export async function apiAdminDeleteProject(projectUid: string) {
  return request<{ message: string }>(`/admin/projects/${projectUid}`, { method: "DELETE" });
}

// ─── Project Images ───────────────────────────────────────────────────────────

export interface ProjectImageRecord {
  id: number;
  image_uid: string;
  user_id: number;
  project_uid: string;
  original_filename: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  image_data?: string | null;
  status: string;
  generated_sql?: string | null;
  tables_count: number;
  relationships_count: number;
  processing_time_ms?: number | null;
  uploaded_at: string;
  completed_at?: string | null;
}

export async function apiUpsertProjectImage(p: {
  image_uid: string; user_id: number; project_uid: string;
  original_filename: string; mime_type?: string; file_size_bytes?: number;
  image_data?: string; status: string; generated_sql?: string;
  tables_count?: number; relationships_count?: number;
  processing_time_ms?: number; completed_at?: number;
}) {
  return request<{ message: string; id: number }>("/project-images", {
    method: "POST", body: JSON.stringify(p),
  });
}

export async function apiGetProjectImages(projectUid: string) {
  return request<ProjectImageRecord[]>(`/project-images/${projectUid}`);
}

export async function apiDeleteProjectImage(imageUid: string) {
  return request<{ message: string }>(`/project-images/${imageUid}`, { method: "DELETE" });
}

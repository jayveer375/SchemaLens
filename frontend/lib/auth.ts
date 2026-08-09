/**
 * lib/auth.ts
 * ───────────
 * Auth service — register and login now talk to the FastAPI backend
 * (http://localhost:8000) which saves everything to PostgreSQL.
 *
 * All other helpers (profile update, admin functions, etc.) keep working
 * via localStorage so the rest of the app is unaffected.
 */

import type { Subscription, User } from "./types";
import { apiRegister, apiLogin, apiUpdateProfile, type BackendUser } from "./api";

const USERS_KEY = "er_ai_users_v2";

// ── Super Admin config ────────────────────────────────────────────────────────
const SA_EMAIL    = process.env.NEXT_PUBLIC_ADMIN_EMAIL    ?? "superadmin@eraistudio.internal";
const SA_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "sa_X9#mP2!qL7vR";
const SA_ID       = "superadmin-fixed-id";

// ── Internal localStorage helpers (kept for admin / profile features) ─────────
function getUsers(): User[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch { return []; }
}

function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function genId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Convert a backend user object to the frontend User shape */
function backendToFrontendUser(bu: {
  id: number;
  full_name: string;
  email: string;
  role: string;
  plan: string;
  is_active?: boolean;
  email_verified?: boolean;
  avatar?: string | null;
  created_at?: string;
  last_login?: string | null;
  conversions_used_this_month: number;
}): User {
  return {
    id: String(bu.id),
    name: bu.full_name,
    email: bu.email,
    role: bu.role as "user" | "admin",
    // Use real DB timestamps so "Member since" and "Last login" are correct
    createdAt: bu.created_at ? new Date(bu.created_at).getTime() : Date.now(),
    lastLogin: bu.last_login ? new Date(bu.last_login).getTime() : undefined,
    emailVerified: bu.email_verified ?? true,
    suspended: false,
    // Restore saved avatar so profile photo survives re-login
    avatar: bu.avatar ?? undefined,
    subscription: {
      planId: (bu.plan === "pro" ? "pro" : "free"),
      startedAt: Date.now(),
      renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      // Restore real usage count from DB so dashboard stats are correct
      conversionsUsedThisMonth: bu.conversions_used_this_month,
      aiGenerationsUsedThisMonth: 0, // Initialize AI generations to 0
      lastResetMonth: new Date().toISOString().slice(0, 7),
    },
  };
}

// ── Seed Super Admin (idempotent) ─────────────────────────────────────────────
export function seedSuperAdmin() {
  if (typeof window === "undefined") return;
  const users = getUsers();
  const cleaned = users.filter(
    (u) => !(u.role === "admin" && u.id !== SA_ID)
  );
  const alreadyExists = cleaned.some((u) => u.id === SA_ID);
  if (!alreadyExists) {
    cleaned.push({
      id: SA_ID,
      name: "Super Admin",
      email: SA_EMAIL,
      role: "admin",
      createdAt: 1000000000000,
      emailVerified: true,
      suspended: false,
    });
  }
  if (!localStorage.getItem(`er_ai_pw_${SA_ID}`)) {
    localStorage.setItem(`er_ai_pw_${SA_ID}`, SA_PASSWORD);
  }
  if (JSON.stringify(cleaned) !== JSON.stringify(users)) {
    saveUsers(cleaned);
  }
}

// ── Register — saves to PostgreSQL ────────────────────────────────────────────
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  const trimEmail = email.trim().toLowerCase();

  // Block the super admin email from being registered
  if (trimEmail === SA_EMAIL.toLowerCase()) {
    throw new Error("This email address is not available for registration.");
  }

  // Call FastAPI backend → INSERT INTO users
  const result = await apiRegister({
    full_name: name.trim(),
    email: trimEmail,
    password,
  });

  const user  = backendToFrontendUser(result.user);
  const token = buildToken(user);
  return { user, token };
}

// ── Login — validates against PostgreSQL, updates last_login ──────────────────
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: User; token: string; projects?: any[]; quickHistory?: any[] }> {
  const trimEmail = email.trim().toLowerCase();

  // Super Admin still uses localStorage (not in PostgreSQL)
  if (trimEmail === SA_EMAIL.toLowerCase()) {
    const users   = getUsers();
    const saUser  = users.find((u) => u.id === SA_ID);
    const storedPw = localStorage.getItem(`er_ai_pw_${SA_ID}`);
    if (!saUser)       throw new Error("No account found with this email.");
    if (storedPw !== password) throw new Error("Incorrect password.");
    if (saUser.suspended) throw new Error("Your account has been suspended.");
    const updated: User = { ...saUser, lastLogin: Date.now() };
    saveUsers(users.map((u) => (u.id === SA_ID ? updated : u)));
    return { user: updated, token: buildToken(updated) };
  }

  // All other users → FastAPI backend → checks bcrypt hash, updates last_login
  const result = await apiLogin({ email: trimEmail, password }) as any;
  const user   = backendToFrontendUser(result.user);
  user.lastLogin = Date.now();
  const token  = buildToken(user);
  return {
    user,
    token,
    projects: result.projects,
    quickHistory: result.quick_history,
  };
}

// ── Google login (mock — unchanged) ──────────────────────────────────────────
export async function googleLogin(): Promise<{ user: User; token: string }> {
  await delay(700);
  const userId = genId();
  const user: User = {
    id: userId,
    name: "Google User",
    email: `google_${userId.slice(0, 8)}@example.com`,
    role: "user",
    createdAt: Date.now(),
    emailVerified: true,
    lastLogin: Date.now(),
  };
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  return { user, token: buildToken(user) };
}

// ── Forgot password (mock — unchanged) ───────────────────────────────────────
export async function forgotPassword(email: string): Promise<void> {
  await delay(600);
  // In production: call backend to send reset email
}

// ── Update profile — calls backend, works for DB users ───────────────────────
export async function updateProfile(
  userId: string,
  updates: Partial<Pick<User, "name" | "avatar">>
): Promise<User> {
  const numericId = parseInt(userId, 10);
  if (!isNaN(numericId)) {
    const payload: { full_name?: string; avatar?: string } = {};
    if (updates.name)   payload.full_name = updates.name;
    if (updates.avatar !== undefined) payload.avatar = updates.avatar;
    const result = await apiUpdateProfile(numericId, payload);
    // Build full user and preserve the avatar in the returned object
    const user = backendToFrontendUser(result.user);
    // avatar comes back from backend as result.user.avatar
    user.avatar = result.user.avatar ?? updates.avatar ?? undefined;
    return user;
  }

  // Fallback: localStorage (super admin)
  await delay(300);
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error("User not found.");
  if (updates.name) updates.name = sanitize(updates.name).slice(0, 80);
  users[idx] = { ...users[idx], ...updates };
  saveUsers(users);
  return users[idx];
}

// ── Change password ────────────────────────────────────────────────────────────
export async function changePassword(
  userId: string,
  currentPw: string,
  newPw: string
): Promise<void> {
  if (newPw.length < 8) throw new Error("New password must be at least 8 characters.");

  // Real DB user — verify + update via backend
  const numericId = parseInt(userId, 10);
  if (!isNaN(numericId) && userId !== SA_ID) {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${API}/user/${numericId}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Failed to change password.");
    }
    return;
  }

  // Fallback: localStorage-only users (Super Admin / demo)
  await delay(400);
  const stored = localStorage.getItem(`er_ai_pw_${userId}`);
  if (stored !== currentPw) throw new Error("Current password is incorrect.");
  localStorage.setItem(`er_ai_pw_${userId}`, newPw);
}

// ── Delete account (hard delete from DB for real users, localStorage for SA) ──
export async function deleteAccount(userId: string): Promise<void> {
  await delay(500);
  if (userId === SA_ID) throw new Error("Super Admin account cannot be deleted.");

  // For real DB users (numeric ID) — permanently delete row from PostgreSQL
  const numericId = parseInt(userId, 10);
  if (!isNaN(numericId)) {
    const { apiDeleteAccount } = await import("./api");
    await apiDeleteAccount(numericId);
    return;
  }

  // Fallback for localStorage-only users
  saveUsers(getUsers().filter((u) => u.id !== userId));
  localStorage.removeItem(`er_ai_pw_${userId}`);
}

// ── Admin helpers (localStorage — unchanged) ──────────────────────────────────
export function getAllUsers(): User[] {
  return getUsers().filter((u) => u.id !== SA_ID);
}

export function toggleSuspend(userId: string): void {
  if (userId === SA_ID) return;
  const users = getUsers();
  saveUsers(users.map((u) => (u.id === userId ? { ...u, suspended: !u.suspended } : u)));
}

export function adminDeleteUser(userId: string): void {
  if (userId === SA_ID) return;
  saveUsers(getUsers().filter((u) => u.id !== userId));
  localStorage.removeItem(`er_ai_pw_${userId}`);
}

export function adminUpdateUser(
  userId: string,
  updates: Partial<Pick<User, "name" | "avatar" | "suspended" | "subscription">>
): User | null {
  if (userId === SA_ID) return null;
  const users = getUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;
  users[index] = { ...users[index], ...updates };
  saveUsers(users);
  return users[index];
}

export function adminUpdateSubscription(
  userId: string,
  subscription: Subscription
): User | null {
  return adminUpdateUser(userId, { subscription });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildToken(user: User): string {
  return btoa(JSON.stringify({ id: user.id, role: user.role, ts: Date.now() }));
}

function sanitize(str: string): string {
  return str.replace(/[<>"'`\\]/g, "").trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

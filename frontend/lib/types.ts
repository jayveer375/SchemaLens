// ─── Core domain types ─────────────────────────────────────────────────────────

export type UserRole   = "user" | "admin";
export type FileStatus = "waiting" | "processing" | "completed" | "failed";
export type PlanId     = "free" | "pro" | "ultimate";

export type DBType =
  | "postgresql" | "mysql" | "sqlite" | "mssql" | "oracle"
  | "mongodb" | "prisma" | "django" | "laravel" | "sequelize" | "hibernate";

// ── Subscription ──────────────────────────────────────────────────────────────
export interface Plan {
  id: PlanId;
  name: string;
  price: number;          // ₹ per month, 0 = free
  conversionsPerMonth: number;
  maxProjects: number;
  maxImagesPerProject: number;
  aiGenerationsPerMonth: number; // AI SQL generation credits
  zipExport: boolean;
  priorityQueue: boolean;
  versionHistory: boolean;
  advancedExport: boolean;
  support: "community" | "priority";
}

export interface Subscription {
  planId: PlanId;
  startedAt: number;
  renewsAt: number;
  conversionsUsedThisMonth: number;
  aiGenerationsUsedThisMonth: number; // AI SQL generation credits used
  lastResetMonth: string; // "YYYY-MM"
  conversionLimitOverride?: number;
  projectLimitOverride?: number;
  imageLimitOverride?: number;
  aiGenerationsLimitOverride?: number;
}

// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  createdAt: number;
  lastLogin?: number;
  emailVerified: boolean;
  suspended?: boolean;
  subscription?: Subscription;
}

// ── Quick Convert (no project needed) ────────────────────────────────────────
export interface QuickConvertResult {
  id: string;
  filename: string;
  imageUrl: string;
  sql: string;
  timestamp: number;
  processingTime: number;
  stats: { tables: number; relationships: number; attributes: number };
}

// ── Project / File ────────────────────────────────────────────────────────────
export interface ProjectFile {
  id: string;
  name: string;
  imageUrl: string;
  status: FileStatus;
  sql?: string;
  error?: string;
  processingTime?: number;
  uploadedAt: number;
  completedAt?: number;
  stats?: { tables: number; relationships: number; attributes: number };
  versions?: Array<{ sql: string; generatedAt: number }>;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  dbType: DBType;
  createdAt: number;
  updatedAt: number;
  files: ProjectFile[];
  pinned?: boolean;
  tags?: string[];
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface AdminUser extends User {
  totalProjects: number;
  totalFiles: number;
  storageUsed: number;
  status: "active" | "suspended";
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  detail: string;
  timestamp: number;
  status: "success" | "failed";
}

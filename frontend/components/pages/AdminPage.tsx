"use client";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, ArrowLeft, Ban, CheckCircle, Database, Download, Eye, FileCode,
  FileJson, FileText, FolderOpen, HardDrive, RefreshCw, Search, Shield, Trash2,
  TrendingUp, UserRound, Users, X, Zap,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  apiAdminGetUsers, apiAdminGetStats, apiAdminSuspendUser,
  apiAdminChangePlan, apiAdminChangeRole, apiAdminResetConversions,
  apiAdminDeleteUser, apiAdminGetUserProjects, apiAdminGetUserProjectImages,
  apiAdminDeleteProject,
  AdminUserRecord, AdminStats, BackendProject,
} from "@/lib/api";
import { cn, downloadText, downloadJSON } from "@/lib/utils";
import toast from "react-hot-toast";

type AdminTab = "overview" | "users" | "projects";
type UserFilter = "all" | "free" | "pro" | "active" | "suspended";

function StatCard({ label, value, detail, icon: Icon, tone }: {
  label: string; value: string | number; detail?: string;
  icon: typeof Users; tone: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", tone)}><Icon size={18} /></div>
        <Activity size={15} className="text-[var(--text-subtle)]" />
      </div>
      <p className="text-3xl font-bold text-[var(--text)] mt-4 truncate">{value}</p>
      <p className="text-base font-semibold text-[var(--text-muted)] mt-1">{label}</p>
      {detail && <p className="text-sm text-[var(--text-subtle)] mt-1 truncate">{detail}</p>}
    </motion.div>
  );
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(s?: string | null) {
  if (!s) return "Never";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPage() {
  const { user: admin } = useStore();
  const [tab, setTab]         = useState<AdminTab>("overview");
  const [users, setUsers]     = useState<AdminUserRecord[]>([]);
  const [stats, setStats]     = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<UserFilter>("all");
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [allProjects, setAllProjects]   = useState<BackendProject[]>([]);
  const [userProjectImages, setUserProjectImages] = useState<any[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([apiAdminGetUsers(), apiAdminGetStats()]);
      setUsers(u);
      setStats(s);
    } catch (e: any) { toast.error("Failed to load admin data: " + e.message); }
    setLoading(false);
  }, []);

  // Load projects for ALL users (used by Projects tab)
  const loadAllProjects = useCallback(async (userList: AdminUserRecord[]) => {
    try {
      const results = await Promise.all(userList.map(u => apiAdminGetUserProjects(u.id).catch(() => [])));
      setAllProjects(results.flat());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // When Projects tab opens and we have users, auto-load all projects
  useEffect(() => {
    if (tab === "projects" && users.length > 0 && allProjects.length === 0) {
      loadAllProjects(users);
    }
  }, [tab, users, allProjects.length, loadAllProjects]);

  const handleSuspend = async (u: AdminUserRecord) => {
    try {
      const res = await apiAdminSuspendUser(u.id, u.is_active); // suspend if active
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: res.user.is_active } : x));
      if (selectedUser?.id === u.id) setSelectedUser(prev => prev ? { ...prev, is_active: res.user.is_active } : prev);
      toast.success(res.user.is_active ? "User reactivated" : "User suspended");
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePlanChange = async (u: AdminUserRecord, plan: "free" | "pro") => {
    try {
      const res = await apiAdminChangePlan(u.id, plan);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, plan: res.user.plan } : x));
      if (selectedUser?.id === u.id) setSelectedUser(prev => prev ? { ...prev, plan: res.user.plan } : prev);
      toast.success(`Plan changed to ${plan}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRoleChange = async (u: AdminUserRecord, role: "user" | "admin") => {
    try {
      const res = await apiAdminChangeRole(u.id, role);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: res.user.role } : x));
      if (selectedUser?.id === u.id) setSelectedUser(prev => prev ? { ...prev, role: res.user.role } : prev);
      toast.success(`Role changed to ${role}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleResetConversions = async (u: AdminUserRecord) => {
    try {
      const res = await apiAdminResetConversions(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, conversions_used_this_month: 0 } : x));
      if (selectedUser?.id === u.id) setSelectedUser(prev => prev ? { ...prev, conversions_used_this_month: 0 } : prev);
      toast.success("Conversions reset");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteUser = async (u: AdminUserRecord) => {
    if (!confirm(`Permanently delete ${u.full_name} (${u.email}) and all their data?`)) return;
    try {
      await apiAdminDeleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setSelectedUser(null);
      toast.success("User deleted");
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteProject = async (projectUid: string) => {
    try {
      await apiAdminDeleteProject(projectUid);
      setAllProjects(prev => prev.filter(p => p.id !== projectUid));
      toast.success("Project deleted");
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const openUser = async (u: AdminUserRecord) => {
    setSelectedUser(u);
    setUserProjectImages([]);
    try {
      const [projs, imgs] = await Promise.all([
        apiAdminGetUserProjects(u.id),
        apiAdminGetUserProjectImages(u.id),
      ]);
      setAllProjects(projs);
      setUserProjectImages(imgs);
    } catch { setAllProjects([]); setUserProjectImages([]); }
  };

  if (selectedUser) {
    return (
      <UserDetail
        user={selectedUser}
        projects={allProjects}
        adminId={admin?.id ?? ""}
        onBack={() => { setSelectedUser(null); setAllProjects([]); setUserProjectImages([]); }}
        onSuspend={() => handleSuspend(selectedUser)}
        onPlanChange={(p) => handlePlanChange(selectedUser, p)}
        onRoleChange={(r) => handleRoleChange(selectedUser, r)}
        onResetConversions={() => handleResetConversions(selectedUser)}
        onDelete={() => handleDeleteUser(selectedUser)}
        onDeleteProject={handleDeleteProject}
        projectImages={userProjectImages}
      />
    );
  }

  const visibleUsers = users.filter(u => {
    const matchSearch = `${u.full_name} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all"       ? true :
      filter === "free"      ? u.plan === "free" :
      filter === "pro"       ? u.plan === "pro" :
      filter === "active"    ? u.is_active :
      filter === "suspended" ? !u.is_active : true;
    return matchSearch && matchFilter;
  });

  const tabs: Array<{ id: AdminTab; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "users",    label: "Users",    icon: Users },
    { id: "projects", label: "Projects", icon: Database },
  ];

  // Collect all projects for the projects tab
  const allUsersProjects = allProjects;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
            <Shield size={21} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-amber-600">Super Admin</p>
            <h1 className="text-3xl font-bold text-[var(--text)]">Control Center</h1>
            <p className="text-base text-[var(--text-muted)] mt-1">Manage accounts, plans, usage and platform activity.</p>
          </div>
        </div>
        <button onClick={reload} disabled={loading} className="btn-ghost self-start lg:self-auto">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="Total Users"      value={stats.total_users}           icon={Users}      tone="bg-blue-50 dark:bg-blue-500/10 text-blue-600" />
          <StatCard label="Active Users"     value={stats.active_users}          icon={Activity}   tone="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600" detail="Currently enabled" />
          <StatCard label="Suspended"        value={stats.suspended_users}       icon={Ban}        tone="bg-red-50 dark:bg-red-500/10 text-red-500" />
          <StatCard label="Pro Plan"         value={stats.pro_users}             icon={Zap}        tone="bg-amber-50 dark:bg-amber-500/10 text-amber-600" />
          <StatCard label="Total Projects"   value={stats.total_projects}        icon={FolderOpen} tone="bg-violet-50 dark:bg-violet-500/10 text-violet-600" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)]">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("flex items-center gap-2 px-4 py-3 text-base font-semibold border-b-2 -mb-px whitespace-nowrap",
              tab === id ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]")}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && stats && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-base font-bold text-[var(--text)] mb-4">Conversions</h2>
            {[
              { label: "Successful", value: stats.successful_conversions, total: stats.total_conversions, color: "bg-emerald-500" },
              { label: "Failed",     value: stats.failed_conversions,     total: stats.total_conversions, color: "bg-red-500" },
            ].map(item => (
              <div key={item.label} className="mb-4 last:mb-0">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[var(--text-muted)]">{item.label}</span>
                  <strong className="text-[var(--text)]">{item.value}</strong>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--surface)] overflow-hidden">
                  <motion.div initial={{ width: 0 }}
                    animate={{ width: `${item.total ? (item.value / item.total) * 100 : 0}%` }}
                    className={cn("h-full rounded-full", item.color)} />
                </div>
              </div>
            ))}
          </div>
          <div className="card p-5">
            <h2 className="text-base font-bold text-[var(--text)] mb-4">Plan Distribution</h2>
            {[
              { label: "Free", value: stats.free_users, color: "bg-slate-400" },
              { label: "Pro",  value: stats.pro_users,  color: "bg-amber-500" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 mb-4 last:mb-0">
                <span className={cn("w-3 h-3 rounded-full flex-shrink-0", item.color)} />
                <div className="flex-1">
                  <div className="flex justify-between text-base">
                    <span className="text-[var(--text-muted)]">{item.label}</span>
                    <strong className="text-[var(--text)]">{item.value}</strong>
                  </div>
                  <div className="h-2 bg-[var(--surface)] rounded-full mt-1.5 overflow-hidden">
                    <div className={cn("h-full rounded-full", item.color)}
                      style={{ width: `${stats.total_users ? (item.value / stats.total_users) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
            <div className="divider my-4" />
            <div className="flex justify-between text-base">
              <span className="text-[var(--text-muted)]">Active (last 30 days)</span>
              <strong className="text-[var(--text)]">{stats.recently_active_users}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-base text-[var(--text)] outline-none focus:border-[var(--primary)]" />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {(["all","free","pro","active","suspended"] as UserFilter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-3.5 py-2 rounded-lg text-base font-semibold whitespace-nowrap",
                    filter === f ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)]")}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {["User","Plan","Status","Projects","Conversions","Last Login","Action"].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-sm uppercase tracking-wider font-bold text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="py-16 text-center text-sm text-[var(--text-muted)]">Loading…</td></tr>
                  ) : visibleUsers.length === 0 ? (
                    <tr><td colSpan={7} className="py-16 text-center text-sm text-[var(--text-muted)]">No users match this filter.</td></tr>
                  ) : visibleUsers.map((u, i) => (
                    <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="border-b border-[var(--border)] last:border-none hover:bg-[var(--surface)]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 text-left">
                          <span className="w-10 h-10 rounded-full bg-[var(--primary-light)] flex items-center justify-center text-base font-bold text-[var(--primary)]">
                            {initials(u.full_name)}
                          </span>
                          <span>
                            <strong className="block text-base text-[var(--text)]">{u.full_name}</strong>
                            <small className="block text-sm text-[var(--text-muted)]">{u.email}</small>
                          </span>
                        </div>
                      </td>
                      <td className="px-5">
                        <span className={cn("badge text-sm", u.plan === "pro" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600" : "badge-gray")}>
                          {u.plan === "pro" ? "Pro" : "Free"}
                        </span>
                      </td>
                      <td className="px-5">
                        <span className={cn("badge text-sm", u.is_active ? "badge-success" : "badge-danger")}>
                          {u.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="px-5 text-base text-[var(--text-muted)]">{u.project_count}</td>
                      <td className="px-5 text-base text-[var(--text-muted)]">{u.conversions_used_this_month} used</td>
                      <td className="px-5 text-base text-[var(--text-muted)]">{formatDate(u.last_login)}</td>
                      <td className="px-5">
                        <div className="flex gap-1">
                          <button title="View user"
                            onClick={() => openUser(u)} className="icon-button">
                            <Eye size={14} className="text-[var(--primary)]" />
                          </button>
                          <button title={u.is_active ? "Suspend" : "Reactivate"}
                            onClick={() => handleSuspend(u)} className="icon-button">
                            {u.is_active ? <Ban size={14} className="text-amber-500" /> : <CheckCircle size={14} className="text-emerald-500" />}
                          </button>
                          {String(u.id) !== admin?.id && (
                            <button title="Delete user" onClick={() => handleDeleteUser(u)} className="icon-button text-red-500">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Projects tab */}
      {tab === "projects" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input value={projectSearch} onChange={e => setProjectSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
          </div>
          <p className="text-xs text-[var(--text-muted)]">All projects across all users.</p>
          {allProjects.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 gap-3">
              <FolderOpen size={28} className="text-[var(--text-subtle)]" />
              <p className="text-sm text-[var(--text-muted)]">Loading projects…</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {["Project","Owner","DB Type","Files","Created","Action"].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-sm uppercase tracking-wider font-bold text-[var(--text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allProjects
                      .filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
                      .map(p => {
                        const owner = users.find(u => u.id === p.user_id);
                        return (
                          <tr key={p.id} className="border-b border-[var(--border)] last:border-none hover:bg-[var(--surface)]">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-base text-[var(--text)]">{p.name}</p>
                              <p className="text-sm text-[var(--text-muted)]">{p.description || "—"}</p>
                            </td>
                            <td className="px-5 text-base text-[var(--text-muted)]">
                              {owner ? <><span className="block font-medium text-[var(--text)]">{owner.full_name}</span><span>{owner.email}</span></> : `User #${p.user_id}`}
                            </td>
                            <td className="px-5 text-base text-[var(--text-muted)]">{p.db_type}</td>
                            <td className="px-5 text-base text-[var(--text-muted)]">{(p.files as any[]).length}</td>
                            <td className="px-5 text-base text-[var(--text-muted)]">{formatDate(p.created_at)}</td>
                            <td className="px-5">
                              <button onClick={() => handleDeleteProject(p.id)} className="icon-button text-red-500" title="Delete project">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── User Detail View ──────────────────────────────────────────────────────────
function UserDetail({ user, projects, adminId, onBack, onSuspend, onPlanChange, onRoleChange, onResetConversions, onDelete, onDeleteProject, projectImages }: {
  user: AdminUserRecord & { avatar?: string | null };
  projects: BackendProject[];
  adminId: string;
  onBack: () => void;
  onSuspend: () => void;
  onPlanChange: (p: "free" | "pro") => void;
  onRoleChange: (r: "user" | "admin") => void;
  onResetConversions: () => void;
  onDelete: () => void;
  onDeleteProject: (uid: string) => void;
  projectImages: any[];
}) {
  const [activeSection, setActiveSection] = useState<"profile" | "projects" | "files">("profile");

  // Files come from project_images table via DB — not from files_json
  const dbFiles = projectImages.map((img: any) => ({
    id:          img.image_uid,
    name:        img.original_filename,
    projectName: img.project_name,
    status:      img.status,
    sql:         img.generated_sql,
    stats: {
      tables:        img.tables_count,
      relationships: img.relationships_count,
    },
    processing_time_ms: img.processing_time_ms,
    uploaded_at:        img.uploaded_at,
    completed_at:       img.completed_at,
  }));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="btn-ghost"><ArrowLeft size={14} /> Back to users</button>

      {/* Header */}
      <div className="card p-5 flex flex-col lg:flex-row lg:items-center gap-4">
        {user.avatar ? (
          <img src={user.avatar} alt={user.full_name}
            className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border border-[var(--border)]" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-[var(--primary-light)] flex items-center justify-center text-lg font-bold text-[var(--primary)] flex-shrink-0">
            {initials(user.full_name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--text)]">{user.full_name}</h1>
            <span className={cn("badge text-xs", user.plan === "pro" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600" : "badge-gray")}>
              {user.plan === "pro" ? "Pro" : "Free"}
            </span>
            <span className={cn("badge text-sm", user.is_active ? "badge-success" : "badge-danger")}>
              {user.is_active ? "Active" : "Suspended"}
            </span>
          </div>
          <p className="text-base text-[var(--text-muted)] mt-1">{user.email}</p>
          <p className="text-base text-[var(--text-subtle)] mt-0.5">Joined {formatDate(user.created_at)} · Last login {formatDate(user.last_login)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onSuspend} className="btn-ghost">
            {user.is_active ? <><Ban size={16} /> Suspend</> : <><CheckCircle size={16} /> Reactivate</>}
          </button>
          {String(user.id) !== adminId && (
            <button onClick={onDelete} className="btn-ghost text-red-500"><Trash2 size={16} /> Delete</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4"><FolderOpen size={18} className="text-[var(--primary)] mb-2" /><p className="text-2xl font-bold text-[var(--text)]">{user.project_count}</p><p className="text-base font-medium text-[var(--text-muted)]">Projects</p></div>
        <div className="card p-4"><FileCode size={18} className="text-[var(--primary)] mb-2" /><p className="text-2xl font-bold text-[var(--text)]">{user.conversion_count}</p><p className="text-base font-medium text-[var(--text-muted)]">Total Conversions</p></div>
        <div className="card p-4"><TrendingUp size={18} className="text-[var(--primary)] mb-2" /><p className="text-2xl font-bold text-[var(--text)]">{user.conversions_used_this_month}</p><p className="text-base font-medium text-[var(--text-muted)]">Used This Month</p></div>
        <div className="card p-4"><UserRound size={18} className="text-[var(--primary)] mb-2" /><p className="text-2xl font-bold text-[var(--text)] capitalize">{user.role}</p><p className="text-base font-medium text-[var(--text-muted)]">Role</p></div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {[
          { id: "profile",  label: "Profile & controls" },
          { id: "projects", label: "Project history" },
          { id: "files",    label: "Generated files" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveSection(t.id as any)}
            className={cn("px-4 py-3 text-base font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
              activeSection === t.id
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile & controls */}
      {activeSection === "profile" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-base font-bold text-[var(--text)] mb-4">Account Details</h2>
            <div className="space-y-0">
              {[
                { label: "Full Name",      value: user.full_name },
                { label: "Email",          value: user.email },
                { label: "Role",           value: user.role },
                { label: "Registration",   value: formatDate(user.created_at) },
                { label: "Last Login",     value: formatDate(user.last_login) },
                { label: "Email Verified", value: user.email_verified ? "✓ Verified" : "✗ Not verified" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)] last:border-none">
                  <span className="text-base text-[var(--text-muted)]">{row.label}</span>
                  <strong className="text-base text-right text-[var(--text)]">{row.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[var(--text)]">Subscription Controls</h2>
              <Zap size={19} className="text-amber-500" />
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-base font-semibold text-[var(--text-muted)] mb-1.5">Plan</label>
                <select value={user.plan} onChange={e => onPlanChange(e.target.value as "free" | "pro")} className="admin-select">
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label className="block text-base font-semibold text-[var(--text-muted)] mb-1.5">Role</label>
                <select value={user.role} onChange={e => onRoleChange(e.target.value as "user" | "admin")} className="admin-select">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={onResetConversions} className="btn-ghost text-base">
                  <RefreshCw size={15} /> Reset Monthly Conversions
                </button>
                <span className="text-base text-[var(--text-muted)]">{user.conversions_used_this_month} used</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project history */}
      {activeSection === "projects" && (
        projects.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 gap-3">
            <FolderOpen size={28} className="text-[var(--text-subtle)]" />
            <p className="text-sm text-[var(--text-muted)]">No projects found for this user</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map(p => (
              <div key={p.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text)]">{p.name}</h3>
                    <p className="text-base text-[var(--text-muted)] mt-0.5">{p.db_type} · {(p.files as any[]).length} files</p>
                    {p.description && <p className="text-sm text-[var(--text-subtle)] mt-1">{p.description}</p>}
                  </div>
                  <button onClick={() => onDeleteProject(p.id)} className="icon-button text-red-500 flex-shrink-0" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="divider my-3" />
                <div className="flex justify-between text-base text-[var(--text-muted)]">
                  <span>{(p.files as any[]).filter((f: any) => f.status === "completed").length} completed</span>
                  <span>Created {formatDate(p.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Generated files */}
      {activeSection === "files" && (
        <GeneratedFilesPanel files={dbFiles} />
      )}
    </div>
  );
}

// ── Generated Files Panel ─────────────────────────────────────────────────────
function GeneratedFilesPanel({ files }: { files: any[] }) {
  const [inspecting, setInspecting] = useState<any | null>(null);
  const [localFiles, setLocalFiles] = useState(files);

  // sync if parent files change
  useState(() => { setLocalFiles(files); });

  const deleteFile = (id: string) =>
    setLocalFiles(prev => prev.filter(f => f.id !== id));

  return (
    <>
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text)]">Generated SQL, TXT, and JSON</h2>
          <p className="text-base text-[var(--text-muted)] mt-1">All files generated by this user across all projects.</p>
        </div>

        {localFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileCode size={28} className="text-[var(--text-subtle)]" />
            <p className="text-sm text-[var(--text-muted)]">No generated files found</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {localFiles.map((f: any, i: number) => {
              const base = f.name?.replace(/\.[^.]+$/, "") ?? "file";
              const hasSql = !!f.sql;
              return (
                <div key={f.id ?? i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--surface)] transition-colors group">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <FileCode size={18} className="text-emerald-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-[var(--text)] truncate">{f.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {f.projectName} · {f.status}{f.stats ? ` · ${f.stats.tables ?? 0} tables` : ""}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={cn("badge text-sm flex-shrink-0 mr-2",
                    f.status === "completed" ? "badge-success" :
                    f.status === "failed"    ? "badge-danger"  : "badge-gray")}>
                    {f.status}
                  </span>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      disabled={!hasSql}
                      onClick={() => setInspecting(f)}
                      title="View SQL"
                      className="icon-button disabled:opacity-30"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      onClick={() => deleteFile(f.id)}
                      title="Remove from list"
                      className="icon-button text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inspect / View modal */}
      <AnimatePresence>
        {inspecting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setInspecting(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{    opacity: 0, y: 12, scale: 0.97 }}
              className="relative z-10 w-full max-w-3xl card overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
                <div>
                  <h3 className="text-base font-bold text-[var(--text)]">{inspecting.name}</h3>
                  <p className="text-base text-[var(--text-muted)] mt-0.5">
                    {inspecting.projectName} · {inspecting.stats?.tables ?? 0} tables
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { downloadText(inspecting.sql, `${inspecting.name?.replace(/\.[^.]+$/, "")}.sql`); }}
                    className="btn-ghost text-base px-3 py-1.5"
                    title="Download SQL"
                  >
                    <Download size={15} /> SQL
                  </button>
                  <button
                    onClick={() => { downloadText(inspecting.sql, `${inspecting.name?.replace(/\.[^.]+$/, "")}.txt`); }}
                    className="btn-ghost text-base px-3 py-1.5"
                    title="Download TXT"
                  >
                    <FileText size={15} /> TXT
                  </button>
                  <button
                    onClick={() => { downloadJSON({ filename: inspecting.name, sql: inspecting.sql, stats: inspecting.stats }, `${inspecting.name?.replace(/\.[^.]+$/, "")}.json`); }}
                    className="btn-ghost text-base px-3 py-1.5"
                    title="Download JSON"
                  >
                    <FileJson size={15} /> JSON
                  </button>
                  <button onClick={() => setInspecting(null)} className="icon-button ml-1">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* SQL content */}
              <pre className="max-h-[60vh] overflow-auto p-5 code-font text-sm leading-6 text-[var(--text)] bg-[var(--surface)] whitespace-pre-wrap">
                {inspecting.sql}
              </pre>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

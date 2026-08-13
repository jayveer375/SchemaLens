"use client";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FolderOpen, History, Settings, Shield,
  ChevronLeft, ChevronRight, Database, LogOut, Plus, Sparkles, CreditCard, UserRound, X, Wand2, ArrowRightLeft, Wrench, ChevronDown, Terminal, Lock, Bot
} from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { canUsePlayground, aiGenerationsLeft } from "@/lib/subscription";

interface SidebarProps {
  page: string;
  onNavigate: (p: string) => void;
}

const toolsItems = [
  { id: "quick-convert", label: "Quick Convert", icon: Sparkles,      badge: "Image → SQL" },
  { id: "generate",      label: "Generate",      icon: Wand2,          badge: "Text → SQL"  },
  { id: "migrate",       label: "Migrator",      icon: ArrowRightLeft, badge: "SQL → SQL"   },
  { id: "playground",    label: "Playground",    icon: Terminal,       badge: "SQL Editor"  },
  { id: "assistant",     label: "AI Assistant",  icon: Bot,            badge: "Ask AI"      },
];

const mainNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects",  label: "Projects",  icon: FolderOpen },
  { id: "history",   label: "History",   icon: History },
  { id: "pricing",   label: "Pricing",   icon: CreditCard },
  { id: "profile",   label: "Profile",   icon: UserRound },
];

// ── Shared classes ────────────────────────────────────────────────────────────
const inactiveNav =
  "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]";

const activeNavBase = "shadow-[0_8px_24px_rgba(0,0,0,0.20)]";

const bottomHover =
  "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]";

const activeStyle: React.CSSProperties = { background: "var(--primary)" };

function activeTextColor(theme: string) {
  return theme === "dark" ? "text-black" : "text-white";
}

// ── NavBtn ────────────────────────────────────────────────────────────────────
function NavBtn({
  active, onClick, title, icon, label, activeClass,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
        active ? activeClass : inactiveNav,
      )}
      style={active ? activeStyle : undefined}
    >
      {icon}
      {label && <span className="truncate">{label}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Sidebar({ page, onNavigate }: SidebarProps) {
  const { user, sidebarCollapsed, setSidebarCollapsed, projects: allProjects, theme, getSubscription } = useStore();
  const activeNav = `${activeNavBase} ${activeTextColor(theme)}`;
  const subscription = getSubscription();
  const isPro = canUsePlayground(subscription);
  const aiCreditsLeft = aiGenerationsLeft(subscription);

  const [mobileOpen, setMobileOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(
    ["quick-convert", "generate", "migrate", "playground", "assistant"].includes(page)
  );

  const projects = allProjects.filter(p => p.ownerId === (user?.id ?? ""));
  const isAdmin = user?.role === "admin";
  const width = sidebarCollapsed ? 72 : 248;
  const isToolPage = ["quick-convert", "generate", "migrate", "playground", "assistant"].includes(page);

  const handleNavigate = (id: string) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <motion.aside
      animate={{ width }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "sidebar fixed left-0 top-0 bottom-0 z-30 flex flex-col overflow-hidden",
        "bg-[var(--surface-sidebar)] border-r border-[var(--border)]",
        mobileOpen && "mobile-sidebar-open"
      )}
    >
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-[60px] px-[14px] border-b border-[var(--border)] flex-shrink-0 gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--primary)" }}
        >
          <Database size={17} className="text-white" />
        </div>

        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="min-w-0"
            >
              <p className="font-bold text-[16px] text-[var(--text)] whitespace-nowrap leading-tight">
                Schemalens
              </p>
              <p className="text-[13px] text-[var(--text-subtle)] whitespace-nowrap leading-tight mt-0.5">
                AI Schema Toolkit
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setMobileOpen(false)}
          className="mobile-sidebar-close"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-[10px] py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">

        {/* ── ADMIN MODE ────────────────────────────────────────────────── */}
        {page === "admin" ? (
          <button
            onClick={() => handleNavigate("admin")}
            title="Admin Panel"
            className={cn(
              "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
              `${activeTextColor(theme)} shadow-[0_8px_24px_rgba(245,158,11,0.20)]`,
            )}
            style={{ background: "linear-gradient(90deg,#F59E0B,#D97706)" }}
          >
            <Shield size={19} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Admin Panel</span>}
          </button>
        ) : (
          <>
            {/* New Project */}
            <button
              onClick={() => handleNavigate("projects")}
              title="New Project"
              className={cn(
                "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[14px] mb-3 text-[15px] font-semibold transition-all duration-200",
                activeTextColor(theme),
              )}
              style={{ background: "var(--primary)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--primary-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--primary)")}
            >
              <Plus size={17} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>New Project</span>}
            </button>

            {/* Dashboard */}
            <NavBtn
              active={page === "dashboard"}
              onClick={() => handleNavigate("dashboard")}
              title="Dashboard"
              icon={<LayoutDashboard size={19} className="flex-shrink-0" />}
              label={!sidebarCollapsed ? "Dashboard" : null}
              activeClass={activeNav}
            />

            {/* ── Tools accordion ───────────────────────────────────────── */}
            <div>
              <button
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                    setToolsOpen(true);
                  } else {
                    setToolsOpen((o) => !o);
                  }
                }}
                title="Tools"
                className={cn(
                  "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
                  isToolPage ? activeNav : inactiveNav,
                )}
                style={isToolPage ? activeStyle : undefined}
              >
                <Wrench size={19} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 truncate text-left">Tools</span>
                    <motion.span animate={{ rotate: toolsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown size={15} />
                    </motion.span>
                  </>
                )}
              </button>

              <AnimatePresence initial={false}>
                {toolsOpen && !sidebarCollapsed && (
                  <motion.div
                    key="tools-dropdown"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 ml-3 pl-3 border-l border-[var(--border)] space-y-0.5 pb-1">
                      {toolsItems.map(({ id, label, icon: Icon, badge }) => {
                        const isLocked = id === "playground" && !isPro;
                        return (
                          <button
                            key={id}
                            onClick={() => handleNavigate(id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-[14px] py-[11px] rounded-[12px] text-[14px] font-medium transition-all duration-200 group",
                              page === id ? activeNav : inactiveNav,
                            )}
                            style={page === id ? activeStyle : undefined}
                          >
                            <Icon size={16} className="flex-shrink-0" />
                            <span className="flex-1 truncate text-left">{label}</span>
                            {isLocked ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(201,155,94,0.18)", color: "var(--warning)", border: "1px solid rgba(201,155,94,0.30)" }}>
                                <Lock size={9} /> Pro
                              </span>
                            ) : (
                              <span className={cn(
                                "text-[11px] font-semibold px-1.5 py-0.5 rounded hidden group-hover:inline-block",
                                page === id
                                  ? `inline-block ${activeTextColor(theme)} bg-black/10`
                                  : "text-white bg-white/20",
                              )}>
                                {badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Rest of main nav */}
            {mainNav.filter(n => n.id !== "dashboard").map(({ id, label, icon: Icon }) => (
              <button
                key={`${id}-${label}`}
                onClick={() => handleNavigate(id)}
                title={label}
                className={cn(
                  "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
                  page === id ? activeNav : inactiveNav,
                )}
                style={page === id ? activeStyle : undefined}
              >
                <Icon size={19} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
                {!sidebarCollapsed && id === "projects" && projects.length > 0 && (
                  <span className={cn(
                    "ml-auto text-[13px] font-bold px-1.5 py-0.5 rounded-full",
                    page === "projects"
                      ? `${activeTextColor(theme)} bg-black/10`
                      : "text-white bg-white/20"
                  )}>
                    {projects.length}
                  </span>
                )}
              </button>
            ))}

            {/* Admin section */}
            {isAdmin && (
              <>
                <div className="pt-4 pb-1">
                  {!sidebarCollapsed && (
                    <p className="text-[13px] font-semibold uppercase tracking-widest text-[var(--text-subtle)] px-[18px] opacity-60">
                      Admin
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleNavigate("admin")}
                  title="Admin Panel"
                  className={cn(
                    "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
                    page === "admin"
                      ? `${activeTextColor(theme)} shadow-[0_8px_24px_rgba(245,158,11,0.20)]`
                      : inactiveNav,
                  )}
                  style={page === "admin" ? { background: "linear-gradient(90deg,#F59E0B,#D97706)" } : undefined}
                >
                  <Shield size={19} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span>Admin Panel</span>}
                </button>
              </>
            )}

            {/* Recent projects */}
            {!sidebarCollapsed && projects.length > 0 && (
              <div className="pt-4">
                <p className="text-[13px] font-semibold uppercase tracking-widest text-[var(--text-subtle)] px-[18px] mb-2 opacity-60">
                  Projects
                </p>
                {projects.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { useStore.getState().setActiveProject(p.id); handleNavigate("project-detail"); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-[18px] py-[11px] rounded-[12px] text-[14px] transition-all duration-200",
                      inactiveNav,
                    )}
                  >
                    <div className="w-6 h-6 rounded-md bg-[var(--primary-light)] flex items-center justify-center flex-shrink-0">
                      <Database size={12} className="text-[var(--primary)]" />
                    </div>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {/* ── Bottom: settings + sign out + collapse ────────────────────────── */}
      <div className="border-t border-[var(--border)] px-[10px] py-3 space-y-0.5 flex-shrink-0">

        {/* AI Credits Display */}
        {!sidebarCollapsed && (
          <div className="px-[10px] py-2 mb-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} className="text-[var(--primary)]" />
              <span className="text-[11px] font-semibold text-[var(--text)]">AI Credits</span>
              {subscription.planId === "ultimate" ? (
                <span className="ml-auto px-1.5 py-0.2 rounded text-[9px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                  ULTIMATE
                </span>
              ) : isPro ? (
                <span className="ml-auto px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-400">
                  PRO
                </span>
              ) : null}
            </div>
            <div className="flex items-center justify-between">
              {subscription.planId === "ultimate" ? (
                <span className="text-[13px] font-bold text-purple-500">Unlimited</span>
              ) : (
                <span className="text-[13px] font-bold text-[var(--text)]">
                  {aiCreditsLeft} <span className="text-[10px] font-normal text-[var(--text-subtle)]">/ {isPro ? 150 : 50}</span>
                </span>
              )}
              {subscription.planId !== "ultimate" && aiCreditsLeft <= 15 && aiCreditsLeft > 0 && (
                <span className="text-[10px] text-amber-500 font-medium">Low</span>
              )}
              {subscription.planId !== "ultimate" && aiCreditsLeft === 0 && (
                <span className="text-[10px] text-red-500 font-medium">Exhausted</span>
              )}
            </div>
            {subscription.planId === "ultimate" ? (
              <div className="mt-1.5 h-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
            ) : aiCreditsLeft > 0 ? (
              <div className="mt-1.5 h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, (aiCreditsLeft / (isPro ? 150 : 50)) * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Settings */}
        {page !== "admin" && (
          <button
            onClick={() => handleNavigate("settings")}
            title="Settings"
            className={cn(
              "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
              page === "settings" ? activeNav : bottomHover,
            )}
            style={page === "settings" ? activeStyle : undefined}
          >
            <Settings size={19} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
        )}

        {/* Sign Out */}
        <button
          onClick={() => { useStore.getState().logout(); }}
          title="Sign out"
          className={cn(
            "w-full flex items-center gap-3 px-[18px] py-[13px] rounded-[12px] text-[15px] font-medium transition-all duration-200",
            bottomHover,
          )}
        >
          <LogOut size={19} className="flex-shrink-0" />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            "w-full flex items-center justify-center py-[11px] rounded-[12px] transition-all duration-200",
            bottomHover,
          )}
        >
          {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      <button
        onClick={() => setMobileOpen((open) => !open)}
        className="mobile-sidebar-toggle"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
      >
        {mobileOpen ? <X size={20} /> : <Database size={20} />}
      </button>
    </motion.aside>
  );
}

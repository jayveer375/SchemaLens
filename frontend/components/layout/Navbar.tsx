"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Search, CheckCircle2, User, Settings, LogOut, ArrowRight, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { initials, cn } from "@/lib/utils";
import { getPlan } from "@/lib/subscription";
import GlobalSearch from "@/components/GlobalSearch";

interface NavbarProps { onNavigate: (p: string) => void; page?: string; }

export default function Navbar({ onNavigate, page }: NavbarProps) {
  const isAdminPage = page === "admin";
  const { theme, setTheme, user, sidebarCollapsed, getSubscription, projects: allProjects } = useStore();
  const sub  = getSubscription();
  const plan = getPlan(sub);
  const ml   = sidebarCollapsed ? 72 : 248;

  const [popupOpen,  setPopupOpen]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const myProjects = allProjects.filter(p => p.ownerId === (user?.id ?? ""));

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header
        style={{ left: ml }}
        className="app-navbar fixed top-0 right-0 z-20 h-[57px] flex items-center justify-between
          px-6 bg-[var(--card)] border-b border-[var(--border)] transition-[left] duration-[250ms]"
      >
        {/* Search trigger — hidden on admin page */}
        {!isAdminPage && (
        <button
          onClick={() => setSearchOpen(true)}
          className="relative hidden sm:flex items-center gap-2 pl-3 pr-3 py-2 text-sm rounded-xl
            border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]
            hover:border-[var(--primary)]/50 hover:text-[var(--text)] transition-all w-96 text-left"
        >
          <Search size={14} className="flex-shrink-0" />
          <span className="flex-1 text-sm">Search projects, SQL...</span>
          <span className="flex items-center gap-0.5 flex-shrink-0">
            <kbd className="inline-flex items-center justify-center px-1.5 h-5 rounded border
              border-[var(--border)] bg-[var(--card)] text-[10px] font-mono text-[var(--text-subtle)]">Ctrl</kbd>
            <kbd className="inline-flex items-center justify-center px-1.5 h-5 rounded border
              border-[var(--border)] bg-[var(--card)] text-[10px] font-mono text-[var(--text-subtle)]">K</kbd>
          </span>
        </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* AI Assistant Button */}
          {!isAdminPage && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => useStore.getState().setAiAssistantOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border)]
                bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--primary)]/50
                transition-all text-xs font-semibold"
              title="Open AI Assistant Panel"
            >
              <Sparkles size={14} className="text-[var(--primary)]" />
              <span className="hidden sm:inline">AI Assistant</span>
            </motion.button>
          )}

          {/* Theme */}
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="w-8 h-8 rounded-xl flex items-center justify-center
              text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </motion.button>

          {/* Avatar — toggles popup */}
          {!isAdminPage && (
            <button
              onClick={() => setPopupOpen((v) => !v)}
              className={cn(
                "relative z-50 w-8 h-8 rounded-full overflow-hidden bg-primary-100 dark:bg-primary-900/40",
                "flex items-center justify-center text-xs font-bold text-primary-600",
                "cursor-pointer hover:ring-2 hover:ring-primary-500/50 transition-all flex-shrink-0",
                popupOpen && "ring-2 ring-primary-500/60"
              )}
            >
              {user?.avatar
                ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                : (user ? initials(user.name) : "?")}
            </button>
          )}
        </div>
      </header>

      {/* ── Profile popup ── */}
      <AnimatePresence>
        {popupOpen && (
          <>
            {/* Invisible full-screen backdrop — closes on any click */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPopupOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed top-[64px] right-5 z-50 w-72
                bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Top — avatar + name */}
              <div className="flex flex-col items-center text-center px-6 pt-6 pb-5 border-b border-[var(--border)]">
                <div className="relative mb-3">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user?.name ?? "avatar"}
                      className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-[var(--border)] shadow-md"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/40
                      flex items-center justify-center text-2xl font-bold text-primary-600
                      border-4 border-white dark:border-[var(--border)] shadow-md">
                      {user ? initials(user.name) : "?"}
                    </div>
                  )}
                  {user?.emailVerified && (
                    <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full
                      bg-emerald-500 border-2 border-white dark:border-[var(--card)]
                      flex items-center justify-center">
                      <CheckCircle2 size={11} className="text-white" />
                    </span>
                  )}
                </div>
                <p className="text-base font-bold text-[var(--text)]">{user?.name}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{user?.email}</p>
                <div className="flex items-center gap-2 mt-2.5 flex-wrap justify-center">
                  <span className={cn(
                    "badge text-xs font-semibold px-2.5 py-0.5",
                    user?.role === "admin"
                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600"
                      : "badge-emerald"
                  )}>
                    {user?.role}
                  </span>
                  <span className={cn(
                    "badge text-xs font-semibold px-2.5 py-0.5",
                    sub.planId === "pro"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600"
                      : "bg-[var(--surface)] text-[var(--text-muted)]"
                  )}>
                    {plan.name} Plan
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-2">
                {[
                  { icon: User,     label: "View Profile",  page: "profile"  },
                  { icon: Settings, label: "Settings",      page: "settings" },
                ].map(({ icon: Icon, label, page }) => (
                  <button
                    key={page}
                    onClick={() => { onNavigate(page); setPopupOpen(false); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-[var(--text-muted)]
                      hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors text-left"
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Upgrade strip (free plan only) */}
              {sub.planId !== "pro" && (
                <div className="mx-4 mb-3 p-3 rounded-xl bg-gradient-to-r from-primary-50 to-primary-100
                  dark:from-primary-900/20 dark:to-primary-900/10 border border-primary-200/50 dark:border-primary-800/30">
                  <p className="text-xs text-primary-700 dark:text-primary-300 font-semibold mb-1.5">
                    Upgrade to Pro
                  </p>
                  <p className="text-[11px] text-primary-600/80 dark:text-primary-400/80 mb-2.5 leading-relaxed">
                    Unlimited projects, exports &amp; priority support.
                  </p>
                  <button
                    onClick={() => { onNavigate("pricing"); setPopupOpen(false); }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold
                      bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                  >
                    Upgrade Now <ArrowRight size={11} />
                  </button>
                </div>
              )}

              {/* Sign out */}
              <div className="border-t border-[var(--border)] py-2">
                <button
                  onClick={() => { onNavigate("logout"); setPopupOpen(false); }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-sm text-red-500
                    hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* ── Global Search Modal ── */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(page) => { onNavigate(page); setSearchOpen(false); }}
        recentProjects={myProjects}
      />
    </>
  );
}

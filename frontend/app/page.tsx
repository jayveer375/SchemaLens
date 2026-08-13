"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Auth
import AuthLayout from "@/components/auth/AuthLayout";
import LoginPage from "@/components/auth/LoginPage";
import RegisterPage from "@/components/auth/RegisterPage";
import ForgotPasswordPage from "@/components/auth/ForgotPasswordPage";

// Layout
import Sidebar from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";

// Pages
import DashboardPage from "@/components/pages/DashboardPage";
import ProjectsPage from "@/components/pages/ProjectsPage";
import ProjectDetailPage from "@/components/pages/ProjectDetailPage";
import HistoryPage from "@/components/pages/HistoryPage";
import SettingsPage from "@/components/pages/SettingsPage";
import AdminPage from "@/components/pages/AdminPage";
import PricingPage from "@/components/pages/PricingPage";
import QuickConvertPage from "@/components/pages/QuickConvertPage";
import GeneratePage from "@/components/pages/GeneratePage";
import MigratePage from "@/components/pages/MigratePage";
import PlaygroundPage from "@/app/playground/page";
import AssistantPage from "@/components/pages/AssistantPage";
import ProfilePage from "@/components/pages/ProfilePage";
import UsagePage from "@/components/pages/UsagePage";
import AIAssistantPanel from "@/components/AIAssistantPanel";

import { useStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { LayoutDashboard, FolderOpen, History, Settings, Shield } from "lucide-react";

const DatabaseScene = dynamic(() => import("@/components/ambient/DatabaseScene"), { ssr: false });

type AuthPage = "login" | "register" | "forgot";
type AppPage  = "dashboard" | "projects" | "project-detail" | "history" | "quick-convert" | "generate" | "migrate" | "playground" | "assistant" | "pricing" | "profile" | "usage" | "settings" | "admin";

export default function RootPage() {
  const { isAuthenticated, user, sidebarCollapsed } = useStore();
  const [mounted, setMounted] = useState(false);
  const [authPage, setAuthPage] = useState<AuthPage>("login");
  const [appPage, setAppPage] = useState<AppPage>("dashboard");

  useEffect(() => {
    setMounted(true);
    // On mount (refresh / relogin), if already authenticated as admin → go straight to admin
    if (useStore.getState().isAuthenticated && useStore.getState().user?.role === "admin") {
      setAppPage("admin");
    }
  }, []);

  // Listen for navigate events dispatched by gated features (e.g. PlaygroundLocked → Pricing)
  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent<string>).detail;
      if (page) setAppPage(page as AppPage);
    };
    window.addEventListener("navigate", handler);
    return () => window.removeEventListener("navigate", handler);
  }, []);

  if (!mounted) return null;

  // â”€â”€ Not logged in: show auth screens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!isAuthenticated) {
    return (
      <AuthLayout>
        <AnimatePresence mode="wait">
          {authPage === "login" && (
            <motion.div key="login" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
              <LoginPage onNavigate={(p) => {
                if (p === "dashboard") {
                  // Redirect admin users straight to admin panel after login
                  const loggedInUser = useStore.getState().user;
                  setAppPage(loggedInUser?.role === "admin" ? "admin" : "dashboard");
                } else setAuthPage(p as AuthPage);
              }} />
            </motion.div>
          )}
          {authPage === "register" && (
            <motion.div key="register" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
              <RegisterPage onNavigate={(p) => {
                if (p === "dashboard") setAppPage("dashboard");
                else setAuthPage(p as AuthPage);
              }} />
            </motion.div>
          )}
          {authPage === "forgot" && (
            <motion.div key="forgot" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
              <ForgotPasswordPage onNavigate={(p) => setAuthPage(p as AuthPage)} />
            </motion.div>
          )}
        </AnimatePresence>
      </AuthLayout>
    );
  }

  // â”€â”€ Logged in: main app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ml = sidebarCollapsed ? 72 : 248;

  const navigate = (page: string) => {
    // guard admin route
    if (page === "admin" && user?.role !== "admin") return;
    setAppPage(page as AppPage);
  };

  const renderPage = () => {
    switch (appPage) {
      case "dashboard":      return <DashboardPage onNavigate={navigate} />;
      case "projects":       return <ProjectsPage  onNavigate={navigate} />;
      case "project-detail": return <ProjectDetailPage onNavigate={navigate} />;
      case "history":        return <HistoryPage   onNavigate={navigate} />;
      case "quick-convert":  return <QuickConvertPage onNavigate={navigate} />;
      case "generate":       return <GeneratePage onNavigate={navigate} />;
      case "migrate":        return <MigratePage onNavigate={navigate} />;
      case "playground":     return <PlaygroundPage />;
      case "assistant":      return <AssistantPage onNavigate={navigate} />;
      case "pricing":        return <PricingPage />;
      case "profile":        return <ProfilePage onNavigate={navigate} />;
      case "settings":       return <SettingsPage onNavigate={navigate} />;
      case "admin":
        if (user?.role !== "admin") return <div className="text-red-500 p-8">Access denied</div>;
        return <AdminPage />;
      default:
        return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--surface)]">
      <Sidebar page={appPage} onNavigate={navigate} />

      <div className="app-main flex-1 flex flex-col min-h-screen" style={{ marginLeft: ml, transition: "margin-left 0.25s cubic-bezier(0.16,1,0.3,1)" }}>
        <Navbar onNavigate={navigate} page={appPage} />

        <main className="flex-1 pt-[57px] relative overflow-hidden">
          {appPage === "dashboard" && <DatabaseScene />}
          {appPage === "playground" ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="playground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-[calc(100vh-57px)]"
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div
              className="w-full py-7 transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                paddingLeft: sidebarCollapsed ? "1.5rem" : "1.25rem",
                paddingRight: sidebarCollapsed ? "1.5rem" : "1.25rem",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={appPage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderPage()}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[{ id: "dashboard", label: "Home", icon: LayoutDashboard }, { id: "projects", label: "Projects", icon: FolderOpen }, { id: "history", label: "History", icon: History }, ...(user?.role === "admin" ? [{ id: "admin", label: "Admin", icon: Shield }] : []), { id: "settings", label: "Settings", icon: Settings }].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => navigate(id)} className={appPage === id ? "active" : ""}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </nav>

      <AIAssistantPanel />
    </div>
  );
}


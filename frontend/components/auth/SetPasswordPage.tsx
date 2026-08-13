"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import toast from "react-hot-toast";
import type { Project, QuickConvertResult } from "@/lib/types";

export default function SetPasswordPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { setUser, setToken } = useStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);

  useEffect(() => {
    // Retrieve pending Google user from sessionStorage
    const pending = sessionStorage.getItem("pending_google_user");
    if (pending) {
      setPendingUser(JSON.parse(pending));
    } else {
      // No pending user - redirect to login
      toast.error("No pending account found");
      onNavigate("login");
    }
  }, [onNavigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!pendingUser) {
      setError("No user data found");
      return;
    }

    setLoading(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API}/user/${pendingUser.user.id}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to set password");
      }

      // Password set successfully - NOW log the user in
      setUser(pendingUser.user);
      setToken(pendingUser.token);

      // Load projects and history
      const numericId = parseInt(pendingUser.user.id, 10);
      if (!isNaN(numericId) && pendingUser.projects) {
        const mapped: Project[] = (pendingUser.projects || []).map((p: any) => ({
          id: p.id,
          ownerId: pendingUser.user.id,
          name: p.name,
          description: p.description,
          dbType: p.db_type as any,
          createdAt: new Date(p.created_at).getTime(),
          updatedAt: new Date(p.updated_at).getTime(),
          files: (p.files as any[]) ?? [],
          pinned: p.pinned,
        }));
        const mappedQH: QuickConvertResult[] = (pendingUser.quickHistory || []).map((e: any) => ({
          id: e.id,
          filename: e.filename,
          sql: e.sql,
          stats: e.stats as any,
          processingTime: e.processingTime,
          timestamp: e.timestamp,
          imageUrl: e.imageUrl ?? "",
        }));
        useStore.setState({ projects: mapped, quickHistory: mappedQH });
      }

      // Clean up pending user data
      sessionStorage.removeItem("pending_google_user");

      setDone(true);
      toast.success("Password set successfully!");
      setTimeout(() => onNavigate("dashboard"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (!pendingUser) return;
    
    // Skip password setup - log user in WITHOUT password
    setUser(pendingUser.user);
    setToken(pendingUser.token);

    // Load projects and history
    const numericId = parseInt(pendingUser.user.id, 10);
    if (!isNaN(numericId) && pendingUser.projects) {
      const mapped: Project[] = (pendingUser.projects || []).map((p: any) => ({
        id: p.id,
        ownerId: pendingUser.user.id,
        name: p.name,
        description: p.description,
        dbType: p.db_type as any,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
        files: (p.files as any[]) ?? [],
        pinned: p.pinned,
      }));
      const mappedQH: QuickConvertResult[] = (pendingUser.quickHistory || []).map((e: any) => ({
        id: e.id,
        filename: e.filename,
        sql: e.sql,
        stats: e.stats as any,
        processingTime: e.processingTime,
        timestamp: e.timestamp,
        imageUrl: e.imageUrl ?? "",
      }));
      useStore.setState({ projects: mapped, quickHistory: mappedQH });
    }

    sessionStorage.removeItem("pending_google_user");
    toast.success("Welcome! You can set a password later in Settings.");
    onNavigate("dashboard");
  };

  const inp = `w-full py-3.5 text-base rounded-2xl border border-[var(--border)]
    bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)]
    focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all`;

  if (done) {
    return (
      <div className="text-center py-12">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-5"
        >
          <CheckCircle size={38} className="text-emerald-500" />
        </motion.div>
        <h2 className="text-3xl font-bold text-[var(--text)] mb-2">Password Set!</h2>
        <p className="text-base text-[var(--text-muted)]">Redirecting to dashboard…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-[var(--text)] mb-2">Set Your Password</h1>
        <p className="text-base text-[var(--text-muted)]">
          Create a password for <strong>{pendingUser?.user?.email}</strong> so you can sign in with email/password in the future.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10
          border border-red-200 dark:border-red-500/20 rounded-2xl px-5 py-4 mb-6">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handle} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">New Password</label>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Min 8 characters"
              className={`${inp} pl-11 pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors"
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Confirm Password</label>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="Repeat password"
              className={`${inp} pl-11`}
            />
          </div>
        </div>

        <div className="text-xs text-[var(--text-subtle)] space-y-1">
          <p>Password requirements:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>At least 8 characters long</li>
            <li>Include both letters and numbers</li>
            <li>Avoid common passwords</li>
          </ul>
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
            bg-gradient-to-r from-primary-600 to-primary-700 text-white
            hover:shadow-xl hover:shadow-primary-500/30 transition-all disabled:opacity-60 mt-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting password…
            </span>
          ) : (
            "Set Password"
          )}
        </motion.button>
      </form>

      <div className="text-center mt-8">
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Skip for now (you can set it later in settings)
        </button>
      </div>
    </div>
  );
}

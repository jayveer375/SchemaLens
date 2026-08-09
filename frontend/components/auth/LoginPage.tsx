"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, AlertCircle, Chrome } from "lucide-react";
import { loginUser, googleLogin, seedSuperAdmin } from "@/lib/auth";
import { apiGetProjects, apiGetQuickHistory } from "@/lib/api";
import { useStore } from "@/lib/store";
import toast from "react-hot-toast";
import type { Project, QuickConvertResult } from "@/lib/types";

export default function LoginPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { setUser, setToken } = useStore();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      seedSuperAdmin();
      const { user, token, projects: prefetchedProjects, quickHistory: prefetchedQH } = await loginUser(email, password);
      setUser(user);
      setToken(token);

      // Load projects + quick history from DB for numeric (backend) users
      const numericId = parseInt(user.id, 10);
      if (!isNaN(numericId)) {
        try {
          let projects = prefetchedProjects;
          let qHistory = prefetchedQH;

          // Fallback: If not already returned by login response, fetch them in parallel
          if (!projects || !qHistory) {
            const [fetchedProjects, fetchedQH] = await Promise.all([
              projects ? Promise.resolve(projects) : apiGetProjects(numericId),
              qHistory ? Promise.resolve(qHistory) : apiGetQuickHistory(numericId),
            ]);
            projects = projects || (fetchedProjects as any);
            qHistory = qHistory || (fetchedQH as any);
          }

          // Map backend projects → frontend Project shape
          const mapped: Project[] = (projects || []).map((p: any) => ({
            id: p.id,
            ownerId: user.id,
            name: p.name,
            description: p.description,
            dbType: p.db_type as any,
            createdAt: new Date(p.created_at).getTime(),
            updatedAt: new Date(p.updated_at).getTime(),
            files: (p.files as any[]) ?? [],
            pinned: p.pinned,
          }));
          // Map quick history
          const mappedQH: QuickConvertResult[] = (qHistory || []).map((e: any) => ({
            id: e.id,
            filename: e.filename,
            sql: e.sql,
            stats: e.stats as any,
            processingTime: e.processingTime,
            timestamp: e.timestamp,
            imageUrl: e.imageUrl ?? "",
          }));
          useStore.setState({
            projects: mapped,
            quickHistory: mappedQH,
            // Restore real subscription/usage stats from DB
            subscription: user.subscription ?? useStore.getState().subscription,
          });
        } catch {
          // Non-fatal — user still logs in even if history fails to load
        }
      }

      toast.success(`Welcome back, ${user.name}!`);
      onNavigate("dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { user, token } = await googleLogin();
      setUser(user);
      setToken(token);
      toast.success("Signed in with Google!");
      onNavigate("dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inp = `w-full py-3.5 text-base rounded-2xl border border-[var(--border)]
    bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)]
    focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500
    transition-all`;

  return (
    <div>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-[var(--text)] mb-2">Welcome back</h1>
        <p className="text-base text-[var(--text-muted)]">Sign in to your Schemalens account</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10
          border border-red-200 dark:border-red-500/20 rounded-2xl px-5 py-4 mb-6">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Google */}
      <button onClick={handleGoogle} disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-base font-medium
          border-2 border-[var(--border)] bg-[var(--card)] text-[var(--text)]
          hover:bg-[var(--surface)] hover:border-primary-400 transition-all disabled:opacity-60 mb-6">
        <Chrome size={18} className="text-blue-500" />
        Continue with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-sm text-[var(--text-subtle)] whitespace-nowrap">or continue with email</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <form onSubmit={handle} className="space-y-5">
        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Email</label>
          <div className="relative">
            <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com"
              className={`${inp} pl-11 pr-5`}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-[var(--text)]">Password</label>
            <button type="button" onClick={() => onNavigate("forgot")}
              className="text-sm text-primary-600 hover:underline font-medium">
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type={show ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              className={`${inp} pl-11 pr-12`}
            />
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <motion.button
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          type="submit" disabled={loading}
          className="w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
            bg-gradient-to-r from-primary-600 to-primary-700 text-white
            hover:shadow-xl hover:shadow-primary-500/30 transition-all disabled:opacity-60 mt-2">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </span>
          ) : "Sign in"}
        </motion.button>
      </form>

      <p className="text-center text-base text-[var(--text-muted)] mt-8">
        Don't have an account?{" "}
        <button onClick={() => onNavigate("register")}
          className="text-primary-600 font-semibold hover:underline">
          Create one free
        </button>
      </p>
    </div>
  );
}

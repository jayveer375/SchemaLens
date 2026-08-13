"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, CheckCircle } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { registerUser, googleLogin } from "@/lib/auth";
import { useStore } from "@/lib/store";
import toast from "react-hot-toast";
import type { Project, QuickConvertResult } from "@/lib/types";

export default function RegisterPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { setUser, setToken } = useStore();
  const [form, setForm]   = useState({ name: "", email: "", password: "", confirm: "" });
  const [show, setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone]   = useState(false);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleGoogle = async (credentialResponse: any) => {
    setError("");
    setLoading(true);
    try {
      const result = await googleLogin(credentialResponse.credential);
      const { user, token, projects: prefetchedProjects, quickHistory: prefetchedQH, needs_password_setup } = result as any;
      
      // Check if new Google user needs password setup BEFORE logging in
      if (needs_password_setup) {
        // Store user data temporarily but DON'T log them in yet
        sessionStorage.setItem("pending_google_user", JSON.stringify({ user, token, projects: prefetchedProjects, quickHistory: prefetchedQH }));
        toast.success("Welcome! Please set a password for your account.");
        onNavigate("setPassword");
        return;  // Stop here - don't log them in yet
      }
      
      // Existing user - log them in normally
      setUser(user); 
      setToken(token);
      const { apiGetProjects, apiGetQuickHistory } = await import("@/lib/api");
      const numericId = parseInt(user.id, 10);
      if (!isNaN(numericId)) {
        try {
          const projects = prefetchedProjects ?? await apiGetProjects(numericId);
          const qHistory = prefetchedQH        ?? await apiGetQuickHistory(numericId);
          const mapped: Project[] = (projects || []).map((p: any) => ({
            id: p.id, ownerId: user.id, name: p.name,
            description: p.description, dbType: p.db_type as any,
            createdAt: new Date(p.created_at).getTime(),
            updatedAt: new Date(p.updated_at).getTime(),
            files: (p.files as any[]) ?? [], pinned: p.pinned,
          }));
          const mappedQH: QuickConvertResult[] = (qHistory || []).map((e: any) => ({
            id: e.id, filename: e.filename, sql: e.sql,
            stats: e.stats as any, processingTime: e.processingTime,
            timestamp: e.timestamp, imageUrl: e.imageUrl ?? "",
          }));
          useStore.setState({ projects: mapped, quickHistory: mappedQH });
        } catch { /* non-fatal */ }
      }
      toast.success(`Welcome, ${user.name}!`);
      onNavigate("dashboard");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const { user, token } = await registerUser(form.name, form.email, form.password);
      setUser(user); setToken(token);
      setDone(true);
      toast.success("Account created! Welcome to Schemalens.");
      setTimeout(() => onNavigate("dashboard"), 1500);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const inp = `w-full py-3.5 text-base rounded-2xl border border-[var(--border)]
    bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)]
    focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all`;

  if (done) return (
    <div className="text-center py-12">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
        <CheckCircle size={38} className="text-emerald-500" />
      </motion.div>
      <h2 className="text-3xl font-bold text-[var(--text)] mb-2">Account Created!</h2>
      <p className="text-base text-[var(--text-muted)]">Redirecting to your dashboard…</p>
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-[var(--text)] mb-2">Create your account</h1>
        <p className="text-base text-[var(--text-muted)]">Free forever · No credit card required</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10
          border border-red-200 dark:border-red-500/20 rounded-2xl px-5 py-4 mb-6">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handle} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Full Name</label>
          <div className="relative">
            <User size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input className={`${inp} pl-11`} placeholder="John Doe" value={form.name} onChange={f("name")} required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Email</label>
          <div className="relative">
            <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input type="email" className={`${inp} pl-11`} placeholder="you@example.com" value={form.email} onChange={f("email")} required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Password</label>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input type={show ? "text" : "password"} className={`${inp} pl-11 pr-12`}
              placeholder="Min 8 characters" value={form.password} onChange={f("password")} required />
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Confirm Password</label>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input type="password" className={`${inp} pl-11`} placeholder="Repeat password" value={form.confirm} onChange={f("confirm")} required />
          </div>
        </div>

        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          type="submit" disabled={loading}
          className="w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
            bg-gradient-to-r from-primary-600 to-primary-700 text-white
            hover:shadow-xl hover:shadow-primary-500/30 transition-all disabled:opacity-60 mt-2">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating account…
            </span>
          ) : "Create Account"}
        </motion.button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-sm text-[var(--text-subtle)] whitespace-nowrap">or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      {/* Google */}
      <div className="flex justify-center mb-6">
        <GoogleLogin
          onSuccess={handleGoogle}
          onError={() => setError("Google sign-up failed. Please try again.")}
          theme="outline"
          size="large"
          text="signup_with"
          shape="rectangular"
          width="400"
        />
      </div>

      <p className="text-center text-base text-[var(--text-muted)] mt-8">
        Already have an account?{" "}
        <button onClick={() => onNavigate("login")} className="text-primary-600 font-semibold hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}

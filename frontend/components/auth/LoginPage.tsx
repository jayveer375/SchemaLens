"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, AlertCircle } from "lucide-react";
import { GoogleLogin, googleLogout, useGoogleLogin } from "@react-oauth/google";
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
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTime, setBlockTime] = useState(0);

  // Initialize Google OAuth
  const googleLoginHook = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // Convert access token to ID token by calling Google's tokeninfo endpoint
        const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.access_token}`);
        const userInfo = await response.json();
        
        if (userInfo.email) {
          await handleGoogleSuccess(userInfo);
        }
      } catch (error) {
        setError("Google sign-in failed. Please try again.");
      }
    },
    onError: () => setError("Google sign-in failed. Please try again."),
  });

  const handleGoogleSuccess = async (userInfo: any) => {
    setLoading(true);
    setError("");
    try {
      // We need to mock a credential for our existing googleLogin function
      // In a real implementation, you'd modify the backend to accept userInfo directly
      const mockCredential = btoa(JSON.stringify({
        sub: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      }));

      const result = await googleLogin(mockCredential);
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

      const numericId = parseInt(user.id, 10);
      if (!isNaN(numericId)) {
        try {
          const projects  = prefetchedProjects  ?? await apiGetProjects(numericId);
          const qHistory  = prefetchedQH        ?? await apiGetQuickHistory(numericId);
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
          
          // CRITICAL FIX: Always use subscription from user object (from database)
          const dbSubscription = user.subscription || {
            planId: user.plan || "free",
            startedAt: Date.now(),
            renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            conversionsUsedThisMonth: user.conversions_used_this_month || 0,
            aiGenerationsUsedThisMonth: 0,
            lastResetMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
          };
          
          useStore.setState({ projects: mapped, quickHistory: mappedQH, subscription: dbSubscription });
        } catch { /* non-fatal */ }
      }

      toast.success(`Welcome back, ${user.name}!`);
      onNavigate("dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          
          // CRITICAL FIX: Always use subscription from user object (from database)
          const dbSubscription = user.subscription || {
            planId: user.plan || "free",
            startedAt: Date.now(),
            renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            conversionsUsedThisMonth: (user as any).subscription?.conversionsUsedThisMonth ?? (user as any).conversions_used_this_month ?? 0,
            aiGenerationsUsedThisMonth: 0,
            lastResetMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
          };
          
          useStore.setState({
            projects: mapped,
            quickHistory: mappedQH,
            subscription: dbSubscription,
          });
        } catch {
          // Non-fatal — user still logs in even if history fails to load
        }
      }

      toast.success(`Welcome back, ${user.name}!`);
      onNavigate("dashboard");
    } catch (err: any) {
      // Check if it's a rate limiting error
      if (err.message.includes("Try again in")) {
        const timeMatch = err.message.match(/(\d+) seconds/);
        if (timeMatch) {
          const seconds = parseInt(timeMatch[1]);
          setIsBlocked(true);
          setBlockTime(seconds);
          
          // Start countdown
          const interval = setInterval(() => {
            setBlockTime(prev => {
              if (prev <= 1) {
                setIsBlocked(false);
                clearInterval(interval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
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
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">Password</label>
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
          {/* Forgot Password - moved below password input */}
          <div className="text-right mt-2">
            <button type="button" onClick={() => onNavigate("forgot")}
              className="text-sm text-primary-600 hover:underline font-medium">
              Forgot password?
            </button>
          </div>
        </div>

        {/* Submit */}
        <motion.button
          whileHover={{ scale: isBlocked ? 1 : 1.01 }} whileTap={{ scale: isBlocked ? 1 : 0.98 }}
          type="submit" disabled={loading || isBlocked}
          className={`w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
            ${isBlocked 
              ? 'bg-red-500 text-white cursor-not-allowed' 
              : 'bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:shadow-xl hover:shadow-primary-500/30'
            } transition-all disabled:opacity-60 mt-2`}>
          {isBlocked ? (
            <span className="flex items-center gap-2">
              🔒 Blocked for {blockTime}s
            </span>
          ) : loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </span>
          ) : "Sign in"}
        </motion.button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-sm text-[var(--text-subtle)] whitespace-nowrap">or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      {/* Custom Google Button */}
      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={() => googleLoginHook()}
          disabled={loading}
          className="w-full max-w-[400px] flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl text-base font-medium
            bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800
            text-white border-0 hover:shadow-xl hover:shadow-primary-500/30 
            transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed
            hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* Custom Google Icon with proper colors */}
          <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </button>
      </div>

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

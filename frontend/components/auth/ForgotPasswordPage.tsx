"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Shield, KeyRound, Eye, EyeOff } from "lucide-react";
import { sendPasswordResetOTP, verifyPasswordResetOTP, resetPasswordWithOTP } from "@/lib/auth";

type Step = "email" | "otp" | "newPassword" | "success";

export default function ForgotPasswordPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Send OTP to email
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetOTP(email);
      setStep("otp");
    } catch (err: any) { 
      setError(err.message); 
    }
    finally { 
      setLoading(false); 
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await verifyPasswordResetOTP(email, otp);
      setStep("newPassword");
    } catch (err: any) { 
      setError(err.message); 
    }
    finally { 
      setLoading(false); 
    }
  };

  // Step 3: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await resetPasswordWithOTP(email, newPassword);
      setStep("success");
    } catch (err: any) { 
      setError(err.message); 
    }
    finally { 
      setLoading(false); 
    }
  };

  // Success screen
  if (step === "success") {
    return (
      <div className="text-center py-12">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={38} className="text-green-600" />
        </motion.div>
        <h2 className="text-3xl font-bold text-[var(--text)] mb-3">Password Reset Successfully!</h2>
        <p className="text-base text-[var(--text-muted)] mb-8 max-w-sm mx-auto">
          Your password has been updated. You can now sign in with your new password.
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate("login")}
          className="btn-primary px-8 py-3"
        >
          Sign In Now
        </motion.button>
      </div>
    );
  }

  const inputClass = `w-full py-3.5 text-base rounded-2xl border border-[var(--border)]
    bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)]
    focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all`;

  return (
    <div>
      <button onClick={() => step === "email" ? onNavigate("login") : setStep("email")}
        className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-8 transition-colors font-medium">
        <ArrowLeft size={15} /> {step === "email" ? "Back to login" : "Back to email"}
      </button>

      {/* Step 1: Enter Email */}
      {step === "email" && (
        <div>
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-[var(--text)] mb-2">Reset your password</h1>
            <p className="text-base text-[var(--text-muted)]">
              Enter your email address and we'll send you a 6-digit OTP to reset your password.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10
              border border-red-200 dark:border-red-500/20 rounded-2xl px-5 py-4 mb-6">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSendOTP} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">Email address</label>
              <div className="relative">
                <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required
                  placeholder="jayveervora47@gmail.com"
                  className={`${inputClass} pl-11 pr-5`}
                />
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.01 }} 
              whileTap={{ scale: 0.98 }}
              type="submit" 
              disabled={loading}
              className="w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
                bg-gradient-to-r from-primary-600 to-primary-700 text-white
                hover:shadow-xl hover:shadow-primary-500/30 transition-all disabled:opacity-60">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending OTP...
                </span>
              ) : "Send OTP"}
            </motion.button>
          </form>
        </div>
      )}

      {/* Step 2: Enter OTP */}
      {step === "otp" && (
        <div>
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-[var(--text)] mb-2">Enter OTP</h1>
            <p className="text-base text-[var(--text-muted)]">
              We sent a 6-digit OTP to <strong className="text-[var(--text)]">{email}</strong>
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10
              border border-red-200 dark:border-red-500/20 rounded-2xl px-5 py-4 mb-6">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleVerifyOTP} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">6-Digit OTP</label>
              <div className="relative">
                <Shield size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
                <input 
                  type="text" 
                  value={otp} 
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  placeholder="123456"
                  className={`${inputClass} pl-11 pr-5 text-center text-2xl tracking-widest font-mono`}
                />
              </div>
              <p className="text-xs text-[var(--text-subtle)] mt-2">
                Check your inbox and enter the 6-digit code we sent you
              </p>
            </div>

            <motion.button 
              whileHover={{ scale: 1.01 }} 
              whileTap={{ scale: 0.98 }}
              type="submit" 
              disabled={loading || otp.length !== 6}
              className="w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
                bg-gradient-to-r from-primary-600 to-primary-700 text-white
                hover:shadow-xl hover:shadow-primary-500/30 transition-all disabled:opacity-60">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : "Verify OTP"}
            </motion.button>

            {/* Resend OTP */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setStep("email")}
                className="text-sm text-primary-600 hover:underline font-medium"
              >
                Didn't receive the OTP? Send again
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3: New Password */}
      {step === "newPassword" && (
        <div>
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-[var(--text)] mb-2">Create New Password</h1>
            <p className="text-base text-[var(--text-muted)]">
              Enter your new password below. Make it strong and secure.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10
              border border-red-200 dark:border-red-500/20 rounded-2xl px-5 py-4 mb-6">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">New Password</label>
              <div className="relative">
                <KeyRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Enter new password"
                  className={`${inputClass} pl-11 pr-12`}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">Confirm Password</label>
              <div className="relative">
                <KeyRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                  className={`${inputClass} pl-11 pr-5`}
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
              disabled={loading || newPassword.length < 8}
              className="w-full flex items-center justify-center py-4 rounded-2xl text-base font-semibold
                bg-gradient-to-r from-primary-600 to-primary-700 text-white
                hover:shadow-xl hover:shadow-primary-500/30 transition-all disabled:opacity-60">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating Password...
                </span>
              ) : "Update Password"}
            </motion.button>
          </form>
        </div>
      )}
    </div>
  );
}

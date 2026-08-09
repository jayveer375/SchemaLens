"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Mail, User, Shield, CalendarDays, CheckCircle2, Clock, ArrowRight, X, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { updateProfile } from "@/lib/auth";
import { initials, cn } from "@/lib/utils";
import { getPlan, aiGenerationsLeft, canUsePlayground } from "@/lib/subscription";
import toast from "react-hot-toast";

export default function ProfilePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user, setUser, getSubscription } = useStore();
  const sub  = getSubscription();
  const plan = getPlan(sub);
  const isPro = canUsePlayground(sub);
  const aiCreditsLeft = aiGenerationsLeft(sub);

  const [name, setName]     = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoPopup, setPhotoPopup] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const inp =
    "w-full py-3 px-4 text-base rounded-xl border border-[var(--border)] bg-[var(--card)] " +
    "text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none " +
    "focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all";

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Photo must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setAvatar(dataUrl);
      if (!user) return;
      setPhotoSaving(true);
      try {
        const updated = await updateProfile(user.id, { name, avatar: dataUrl });
        setUser({ ...user, name: updated.name, avatar: dataUrl });
        toast.success("Profile photo updated!");
      } catch (e: any) { toast.error(e.message); }
      setPhotoSaving(false);
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error("Name cannot be empty"); return; }
    setSaving(true);
    try {
      const updated = await updateProfile(user.id, { name, avatar: avatar ?? undefined });
      setUser({ ...user, name: updated.name, avatar: avatar ?? undefined });
      toast.success("Profile updated!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const lastLogin = user?.lastLogin
    ? new Date(user.lastLogin).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <div className="w-full max-w-none">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text)]">Profile</h1>
        <p className="text-base text-[var(--text-muted)] mt-1.5">View and update your personal information</p>
      </div>

      {/* ── Two-column layout: big form left, two cards right ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── LEFT COLUMN — big form card ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="card p-8"
        >
          <h3 className="text-lg font-bold text-[var(--text)] mb-7">Personal Information</h3>
          <div className="space-y-7">

            {/* Full Name */}
            <div>
              <label className="flex items-center gap-2 text-base font-semibold text-[var(--text)] mb-2.5">
                <User size={17} className="text-[var(--text-muted)]" />
                Full Name
              </label>
              <input
                className={inp}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            {/* Email */}
            <div>
              <label className="flex items-center gap-2 text-base font-semibold text-[var(--text)] mb-2.5">
                <Mail size={17} className="text-[var(--text-muted)]" />
                Email Address
              </label>
              <input className={cn(inp, "opacity-60 cursor-not-allowed")} value={user?.email ?? ""} readOnly />
              <p className="text-sm text-[var(--text-subtle)] mt-2">Email address cannot be changed</p>
            </div>

            {/* Info box */}
            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
              <p className="text-base text-[var(--text-muted)] leading-relaxed">
                Your <span className="font-semibold text-[var(--text)]">display name</span> is shown across projects,
                exports, and history. Only the name field can be edited here — contact support for any other changes.
              </p>
            </div>

            {/* Save */}
            <div className="pt-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="btn-primary text-base disabled:opacity-60 px-10 py-3"
                style={{ boxShadow: "none" }}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </span>
                ) : "Save Changes"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── RIGHT COLUMN — avatar card + account details card ── */}
        <div className="space-y-6">

          {/* Avatar card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="card p-7"
          >
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-5">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={user?.name ?? "avatar"}
                    onClick={() => setPhotoPopup(true)}
                    className="w-28 h-28 rounded-full object-cover border-4 border-white dark:border-[var(--border)] shadow-lg cursor-pointer hover:brightness-90 transition-all"
                  />
                ) : (
                  <div
                    onClick={() => setPhotoPopup(true)}
                    className="w-28 h-28 rounded-full bg-primary-100 dark:bg-primary-900/40
                      flex items-center justify-center text-4xl font-bold text-primary-600
                      border-4 border-white dark:border-[var(--border)] shadow-lg
                      cursor-pointer hover:brightness-95 transition-all select-none">
                    {user ? initials(user.name) : "?"}
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={photoSaving}
                  title="Upload photo"
                  className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-primary-600 hover:bg-primary-700
                    flex items-center justify-center text-white shadow-md transition-colors
                    border-2 border-white dark:border-[var(--card)] disabled:opacity-70"
                >
                  {photoSaving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Camera size={16} />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handlePhoto}
                />
              </div>

              <h2 className="text-2xl font-bold text-[var(--text)]">{user?.name}</h2>
              <p className="text-base text-[var(--text-muted)] mt-1">{user?.email}</p>

              <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                <span className={cn(
                  "badge text-sm font-semibold px-3 py-1",
                  user?.role === "admin"
                    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600"
                    : "badge-emerald"
                )}>
                  {user?.role}
                </span>
                <span className={cn(
                  "badge text-sm font-semibold px-3 py-1",
                  sub.planId === "pro"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600"
                    : "bg-[var(--surface)] text-[var(--text-muted)]"
                )}>
                  {plan.name} Plan
                </span>
                {user?.emailVerified && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
                    <CheckCircle2 size={14} /> Verified
                  </span>
                )}
              </div>

              <p className="text-sm text-[var(--text-subtle)] mt-4 leading-relaxed">
                Click the camera icon to update your photo. Saves automatically.
                <br />PNG, JPG, WEBP · max 2 MB
              </p>
            </div>
          </motion.div>

          {/* Account Details card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="card p-7"
          >
            <h3 className="text-base font-bold text-[var(--text)] mb-5">Account Details</h3>
            <div className="space-y-1">
              {[
                { icon: CalendarDays, label: "Member since", value: memberSince },
                { icon: Clock,        label: "Last login",   value: lastLogin   },
                { icon: Shield,       label: "Plan",         value: `${plan.name} — ₹${plan.price}/mo` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label}
                  className="flex items-center justify-between py-3.5 border-b border-[var(--border)] last:border-none">
                  <div className="flex items-center gap-2.5">
                    <Icon size={17} className="text-[var(--text-muted)]" />
                    <span className="text-base text-[var(--text-muted)]">{label}</span>
                  </div>
                  <span className="text-base font-semibold text-[var(--text)]">{value}</span>
                </div>
              ))}
            </div>

            {/* AI Credits Section */}
            <div className="mt-5 pt-5 border-t border-[var(--border)]">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} className="text-[var(--primary)]" />
                <span className="text-sm font-semibold text-[var(--text)]">AI Credits</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-[var(--text)]">
                  {isPro ? "Unlimited" : aiCreditsLeft}
                </span>
                {!isPro && (
                  <span className="text-xs text-[var(--text-subtle)]">/ 70 per month</span>
                )}
              </div>
              {!isPro && (
                <div className="h-2 bg-[var(--surface)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[var(--primary)] transition-all duration-300"
                    style={{ width: `${(aiCreditsLeft / 70) * 100}%` }}
                  />
                </div>
              )}
              {!isPro && aiCreditsLeft <= 10 && aiCreditsLeft > 0 && (
                <p className="text-xs text-amber-500 mt-2 font-medium">
                  Low credits remaining. Consider upgrading to Pro.
                </p>
              )}
              {!isPro && aiCreditsLeft === 0 && (
                <button
                  onClick={() => onNavigate("pricing")}
                  className="mt-2 w-full btn-primary text-xs py-2"
                >
                  Upgrade to Pro for Unlimited
                </button>
              )}
            </div>

            <div className="mt-5 pt-5 border-t border-[var(--border)] flex flex-col gap-2.5">
              <button
                onClick={() => onNavigate("settings")}
                className="w-full btn-ghost text-base py-2.5 justify-center"
              >
                Change Password
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Photo preview popup ── */}
      <AnimatePresence>
        {photoPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setPhotoPopup(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="relative cursor-default"
            >
              {/* Close button */}
              <button
                onClick={() => setPhotoPopup(false)}
                className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-[var(--card)]
                  shadow-lg flex items-center justify-center text-[var(--text-muted)]
                  hover:text-[var(--text)] transition-colors"
              >
                <X size={16} />
              </button>

              {avatar ? (
                <img
                  src={avatar}
                  alt={user?.name ?? "avatar"}
                  className="w-72 h-72 rounded-full object-cover border-4 border-white shadow-2xl"
                />
              ) : (
                <div className="w-72 h-72 rounded-full bg-primary-100 dark:bg-primary-900/40
                  flex items-center justify-center text-8xl font-bold text-primary-600
                  border-4 border-white shadow-2xl select-none">
                  {user ? initials(user.name) : "?"}
                </div>
              )}

              <div className="mt-4 text-center">
                <p className="text-white font-bold text-xl drop-shadow">{user?.name}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

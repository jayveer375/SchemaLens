"use client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Check, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { PLANS } from "@/lib/subscription";

interface UpgradeLimitDialogProps {
  open: boolean;
  onClose: () => void;
  reason: "conversions" | "projects" | "images" | "import";
  onNavigatePricing?: () => void;
}

const REASONS = {
  conversions: {
    title: "Monthly Limit Reached",
    desc: "You've used all 5 free conversions this month.",
    detail: "Upgrade to Pro for 50 conversions per month — 10× more power.",
  },
  projects: {
    title: "Project Limit Reached",
    desc: "Free plan allows a maximum of 3 projects.",
    detail: "Upgrade to Pro to create up to 25 projects and stay organized.",
  },
  images: {
    title: "Image Limit Reached",
    desc: "Free plan allows up to 5 images per project.",
    detail: "Upgrade to Pro to upload up to 25 images per project.",
  },
  import: {
    title: "Pro & Ultimate Exclusive",
    desc: "Import Project is only available for Pro and Ultimate subscribers.",
    detail: "Upgrade to Pro or Ultimate to import project backups, SQL schemas, and share workflows.",
  },
};

const PRO = PLANS.pro;
const PRO_FEATURES = [
  `${PRO.conversionsPerMonth} conversions / month`,
  `${PRO.maxProjects} projects`,
  `${PRO.maxImagesPerProject} images per project`,
  "Import & Export Projects (.json / .sql)",
  "ZIP project export",
  "Version history",
  "Advanced export (SQL · TXT · JSON)",
  "Priority support",
];

export default function UpgradeLimitDialog({
  open, onClose, reason, onNavigatePricing,
}: UpgradeLimitDialogProps) {
  const { upgradeToPro } = useStore();
  const info = REASONS[reason];

  const handleUpgrade = () => {
    onClose();
    if (onNavigatePricing) onNavigatePricing();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md card p-0 overflow-hidden"
          >
            {/* Purple gradient header */}
            <div className="bg-gradient-to-br from-primary-600 to-primary-800 px-6 pt-6 pb-8 text-white">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors"
              >
                <X size={14} className="text-white" />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
                <Zap size={22} className="text-yellow-300" />
              </div>
              <h2 className="text-xl font-bold mb-1">{info.title}</h2>
              <p className="text-white/75 text-sm leading-relaxed">{info.desc}</p>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-sm text-[var(--text-muted)] mb-4">{info.detail}</p>

              {/* Pro features */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-primary-600 uppercase tracking-wider">Pro Plan</span>
                  <span className="badge badge-purple text-[10px]">₹199/mo</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                  {PRO_FEATURES.map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Check size={11} className="text-emerald-500 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="btn-ghost flex-1 justify-center text-sm py-2.5">
                  Maybe Later
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleUpgrade}
                  className="btn-primary flex-1 justify-center text-sm py-2.5"
                >
                  View Plans <ArrowRight size={14} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

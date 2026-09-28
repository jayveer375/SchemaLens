import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Project, ProjectFile, ActivityLog, AdminUser, QuickConvertResult, Subscription, PlanId, CustomColumn } from "./types";
import { defaultSubscription, maybeResetMonthly, incrementAIGenerations as incrementAIGenerationsSub } from "./subscription";
import { PRESET_CUSTOM_COLUMNS } from "./customization";

export interface AnalysisResult {
  id: string;
  filename: string;
  imageUrl: string;
  sql: string;
  timestamp: number;
  processingTime: number;
  stats: {
    tables: number;
    relationships: number;
    attributes: number;
    confidence: number;
    processingTime: number;
  };
}

export interface HistoryEntry {
  id: string;
  name: string;
  timestamp: number;
  imageUrl: string;
  sql: string;
  stats: AnalysisResult["stats"];
}

// ─── Slices ───────────────────────────────────────────────────────────────────
interface AuthSlice {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (u: User | null) => void;
  setToken: (t: string | null) => void;
  logout: () => void;
}

interface UISlice {
  theme: "light" | "dark";
  selectedLanguage: string;
  sidebarCollapsed: boolean;
  aiAssistantOpen: boolean;
  mobileSidebarOpen: boolean;
  setTheme: (t: "light" | "dark") => void;
  setSelectedLanguage: (l: string) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setAiAssistantOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

interface SubscriptionSlice {
  subscription: Subscription;
  setSubscription: (s: Subscription) => void;
  upgradeToPro: () => void;
  upgradeToPlan: (planId: PlanId) => void;
  incrementConversions: () => void;
  incrementAIGenerations: (amount?: number) => void;
  getSubscription: () => Subscription; // always fresh (resets if new month)
}

interface QuickConvertSlice {
  quickHistory: QuickConvertResult[];
  addQuickResult: (r: QuickConvertResult) => void;
  clearQuickHistory: () => void;
}

interface LegacyAnalysisSlice {
  appState: "idle" | "processing" | "done" | "error";
  currentResult: AnalysisResult | null;
  error: string | null;
  history: HistoryEntry[];
  setAppState: (state: LegacyAnalysisSlice["appState"]) => void;
  setCurrentResult: (result: AnalysisResult | null) => void;
  setError: (error: string | null) => void;
  addToHistory: (entry: HistoryEntry) => void;
  reset: () => void;
}

interface ProjectsSlice {
  projects: Project[];
  activeProjectId: string | null;
  setProjects: (p: Project[]) => void;
  upsertProject: (p: Project) => void;
  deleteProject: (id: string, ownerId: string) => void;
  setActiveProject: (id: string | null) => void;
  upsertFile: (projectId: string, ownerId: string, file: ProjectFile) => void;
  deleteFile: (projectId: string, ownerId: string, fileId: string) => void;
  updateFileStatus: (projectId: string, ownerId: string, fileId: string, updates: Partial<ProjectFile>) => void;
  getMyProjects: (ownerId: string) => Project[];
}

interface AdminSlice {
  adminUsers: AdminUser[];
  activityLogs: ActivityLog[];
  setAdminUsers: (u: AdminUser[]) => void;
  setActivityLogs: (l: ActivityLog[]) => void;
}

export interface CopilotContext {
  source: "playground" | "er-diagram" | "general";
  currentSql?: string;
  selectedSql?: string;
  selectedLinesCount?: number;
}

interface CopilotSlice {
  copilotContext: CopilotContext;
  setCopilotContext: (ctx: Partial<CopilotContext>) => void;
}

interface PlaygroundSlice {
  playgroundInitialSQL: string | null;
  setPlaygroundInitialSQL: (sql: string | null) => void;
}

interface CustomizationSlice {
  customColumns: CustomColumn[];
  globalPromptRules: string;
  autoApplyToAllTools: boolean;
  addCustomColumn: (col: Omit<CustomColumn, "id" | "createdAt">) => void;
  updateCustomColumn: (id: string, updates: Partial<CustomColumn>) => void;
  deleteCustomColumn: (id: string) => void;
  toggleCustomColumn: (id: string) => void;
  setGlobalPromptRules: (rules: string) => void;
  setAutoApplyToAllTools: (val: boolean) => void;
  resetCustomColumnsToPresets: () => void;
}

interface D2DSlice {
  // Current D2D state
  diagramUid: string | null;
  recommendedTypes: string[];
  selectedType: string | null;
  mermaidCode: string | null;
  isAnalyzing: boolean;
  d2dIsGenerating: boolean;
  d2dError: string | null;
  
  // History
  d2dDiagrams: any[];
  
  // Actions
  setDiagramUid: (uid: string | null) => void;
  setRecommendedTypes: (types: string[]) => void;
  setSelectedType: (type: string | null) => void;
  setMermaidCode: (code: string | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  setD2DError: (error: string | null) => void;
  addDiagram: (diagram: any) => void;
  removeDiagram: (diagramUid: string) => void;
  clearD2DState: () => void;
}

type Store = AuthSlice & UISlice & SubscriptionSlice & QuickConvertSlice & LegacyAnalysisSlice & ProjectsSlice & AdminSlice & PlaygroundSlice & CopilotSlice & CustomizationSlice & D2DSlice;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // ── Auth ────────────────────────────────────────────────────────────────
      user: null,
      token: null,
      isAuthenticated: false,
      setUser: (user) => set({
        user,
        isAuthenticated: !!user,
        // CRITICAL: Always sync subscription from user object (database)
        subscription: user?.subscription ? {
          planId: user.subscription.planId || user.plan || "free",
          startedAt: user.subscription.startedAt || Date.now(),
          renewsAt: user.subscription.renewsAt || Date.now() + 30 * 24 * 60 * 60 * 1000,
          conversionsUsedThisMonth: user.subscription.conversionsUsedThisMonth || 0,
          aiGenerationsUsedThisMonth: user.subscription.aiGenerationsUsedThisMonth || 0,
          lastResetMonth: user.subscription.lastResetMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        } : defaultSubscription(),
      }),
      setToken: (token) => set({ token }),
      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          activeProjectId: null,
          subscription: defaultSubscription(),
          quickHistory: [],
          projects: [],   // clear on logout so next user starts fresh
        }),

      // ── UI ──────────────────────────────────────────────────────────────────
      theme: "light",
      selectedLanguage: "postgresql",
      sidebarCollapsed: false,
      aiAssistantOpen: false,
      mobileSidebarOpen: false,
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== "undefined")
          document.documentElement.classList.toggle("dark", theme === "dark");
      },
      setSelectedLanguage: (l) => set({ selectedLanguage: l }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setAiAssistantOpen: (open) => set({ aiAssistantOpen: open }),
      setMobileSidebarOpen: (open) =>
        set((state) => ({
          mobileSidebarOpen: typeof open === "function" ? open(state.mobileSidebarOpen) : open,
        })),

      // ── Subscription ────────────────────────────────────────────────────────
      subscription: defaultSubscription(),
      setSubscription: (subscription) => set({ subscription }),
      upgradeToPlan: (planId) =>
        set((state) => {
          const upgraded = {
            ...state.subscription,
            planId,
            startedAt: Date.now(),
            renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          };
          return {
            subscription: upgraded,
            user: state.user
              ? { ...state.user, subscription: upgraded }
              : state.user,
          };
        }),
      upgradeToPro: () =>
        set((state) => {
          const upgraded = {
            ...state.subscription,
            planId: "pro" as const,
            startedAt: Date.now(),
            renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          };
          return {
            subscription: upgraded,
            // Also update the user object so user.subscription.planId reflects "pro"
            user: state.user
              ? { ...state.user, subscription: upgraded }
              : state.user,
          };
        }),
      incrementConversions: () =>
        set((state) => {
          const s = maybeResetMonthly(state.subscription);
          const updated = { ...s, conversionsUsedThisMonth: s.conversionsUsedThisMonth + 1 };
          // Persist the incremented count to the backend so it survives logout/login
          const userId = parseInt(state.user?.id ?? "", 10);
          if (!isNaN(userId)) {
            import("./api").then(({ apiIncrementConversions }) => {
              apiIncrementConversions(userId).catch(() => {});
            }).catch(() => {});
          }
          return { subscription: updated };
        }),
      incrementAIGenerations: (amount: number = 1) =>
        set((state) => {
          const s = maybeResetMonthly(state.subscription);
          console.log(`Deducting ${amount} AI credits. Current used:`, s.aiGenerationsUsedThisMonth);
          const updated = incrementAIGenerationsSub(s, amount);
          console.log("Updated used AI credits:", updated.aiGenerationsUsedThisMonth);
          // Persist the incremented count to the backend so it survives logout/login
          const userId = parseInt(state.user?.id ?? "", 10);
          if (!isNaN(userId)) {
            import("./api").then(({ apiIncrementConversions }) => {
              apiIncrementConversions(userId).catch(() => {});
            }).catch(() => {});
          }
          return {
            subscription: updated,
            user: state.user ? { ...state.user, subscription: updated } : state.user,
          };
        }),
      getSubscription: () => maybeResetMonthly(get().subscription),

      // ── Quick Convert ────────────────────────────────────────────────────────
      quickHistory: [],
      addQuickResult: (r) =>
        set((state) => ({
          quickHistory: [r, ...state.quickHistory].slice(0, 20),
        })),
      clearQuickHistory: () => set({ quickHistory: [] }),

      // ── Legacy analysis compatibility ────────────────────────────────────
      appState: "idle",
      currentResult: null,
      error: null,
      history: [],
      setAppState: (appState) => set({ appState }),
      setCurrentResult: (currentResult) => set({ currentResult }),
      setError: (error) => set({ error }),
      addToHistory: (entry) => set((state) => ({ history: [entry, ...state.history].slice(0, 20) })),
      reset: () => set({ appState: "idle", currentResult: null, error: null }),

      // ── Projects ────────────────────────────────────────────────────────────
      projects: [],
      activeProjectId: null,
      setProjects: (projects) => set({ projects }),

      upsertProject: (project) =>
        set((state) => {
          const exists = state.projects.find((p) => p.id === project.id);
          if (exists) {
            if (exists.ownerId !== project.ownerId) return state;
            return { projects: state.projects.map((p) => (p.id === project.id ? project : p)) };
          }
          return { projects: [project, ...state.projects] };
        }),

      deleteProject: (id, ownerId) =>
        set((state) => ({
          projects: state.projects.filter((p) => !(p.id === id && p.ownerId === ownerId)),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        })),

      setActiveProject: (activeProjectId) => set({ activeProjectId }),

      upsertFile: (projectId, ownerId, file) =>
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId || p.ownerId !== ownerId) return p;
            const exists = p.files.find((f) => f.id === file.id);
            return {
              ...p,
              updatedAt: Date.now(),
              files: exists
                ? p.files.map((f) => (f.id === file.id ? file : f))
                : [...p.files, file],
            };
          }),
        })),

      deleteFile: (projectId, ownerId, fileId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId && p.ownerId === ownerId
              ? { ...p, files: p.files.filter((f) => f.id !== fileId) }
              : p
          ),
        })),

      updateFileStatus: (projectId, ownerId, fileId, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId && p.ownerId === ownerId
              ? { ...p, files: p.files.map((f) => (f.id === fileId ? { ...f, ...updates } : f)) }
              : p
          ),
        })),

      getMyProjects: (ownerId) =>
        get().projects.filter((p) => p.ownerId === ownerId),

      // ── Admin ───────────────────────────────────────────────────────────────
      adminUsers: [],
      activityLogs: [],
      setAdminUsers: (adminUsers) => set({ adminUsers }),
      setActivityLogs: (activityLogs) => set({ activityLogs }),

      // ── Playground ──────────────────────────────────────────────────────────
      playgroundInitialSQL: null,
      setPlaygroundInitialSQL: (sql) => set({ playgroundInitialSQL: sql }),

      // ── Copilot Context ─────────────────────────────────────────────────────
      copilotContext: { source: "general" },
      setCopilotContext: (ctx) =>
        set((state) => ({
          copilotContext: { ...state.copilotContext, ...ctx },
        })),

      // ── Customization & Schema Rules ────────────────────────────────────────
      customColumns: [
        {
          id: "col-roll-number",
          name: "roll_number",
          dataType: "VARCHAR(50)",
          defaultValue: "",
          description: "Unique student or candidate identification number used by educational institutions",
          constraints: { notNull: true, primaryKey: false, unique: true, indexed: true },
          enabled: true,
          createdAt: Date.now() - 3600000,
        },
        {
          id: "col-created-at",
          name: "created_at",
          dataType: "TIMESTAMP",
          defaultValue: "CURRENT_TIMESTAMP",
          description: "Timestamp when record was initially created for audit trail",
          constraints: { notNull: true, primaryKey: false, unique: false, indexed: false },
          enabled: true,
          createdAt: Date.now() - 7200000,
        },
        {
          id: "col-updated-at",
          name: "updated_at",
          dataType: "TIMESTAMP",
          defaultValue: "CURRENT_TIMESTAMP",
          description: "Timestamp when record was last modified",
          constraints: { notNull: true, primaryKey: false, unique: false, indexed: false },
          enabled: true,
          createdAt: Date.now() - 7200000,
        },
      ],
      globalPromptRules: "",
      autoApplyToAllTools: true,
      addCustomColumn: (col) =>
        set((state) => ({
          customColumns: [
            ...state.customColumns,
            {
              ...col,
              id: "col-" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
              createdAt: Date.now(),
            },
          ],
        })),
      updateCustomColumn: (id, updates) =>
        set((state) => ({
          customColumns: state.customColumns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      deleteCustomColumn: (id) =>
        set((state) => ({
          customColumns: state.customColumns.filter((c) => c.id !== id),
        })),
      toggleCustomColumn: (id) =>
        set((state) => ({
          customColumns: state.customColumns.map((c) =>
            c.id === id ? { ...c, enabled: !c.enabled } : c
          ),
        })),
      setGlobalPromptRules: (rules) => set({ globalPromptRules: rules }),
      setAutoApplyToAllTools: (val) => set({ autoApplyToAllTools: val }),
      resetCustomColumnsToPresets: () =>
        set({
          customColumns: PRESET_CUSTOM_COLUMNS.map((p, idx) => ({
            ...p,
            id: `preset-${idx}-${Date.now()}`,
            createdAt: Date.now(),
          })),
        }),

      // ── D2D ──────────────────────────────────────────────────────────────
      diagramUid: null,
      recommendedTypes: [],
      selectedType: null,
      mermaidCode: null,
      isAnalyzing: false,
      d2dIsGenerating: false,
      d2dError: null,
      d2dDiagrams: [],
      setDiagramUid: (uid) => set({ diagramUid: uid }),
      setRecommendedTypes: (types) => set({ recommendedTypes: types }),
      setSelectedType: (type) => set({ selectedType: type }),
      setMermaidCode: (code) => set({ mermaidCode: code }),
      setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
      setIsGenerating: (generating) => set({ d2dIsGenerating: generating }),
      setD2DError: (d2dError) => set({ d2dError }),
      addDiagram: (diagram: any) =>
        set((state) => ({
          d2dDiagrams: [...state.d2dDiagrams, diagram].slice(0, 20),
        })),
      removeDiagram: (diagramUid) =>
        set((state) => ({
          d2dDiagrams: state.d2dDiagrams.filter((d: any) => d.diagram_uid !== diagramUid),
        })),
      clearD2DState: () =>
        set({
          diagramUid: null,
          recommendedTypes: [],
          selectedType: null,
          mermaidCode: null,
          isAnalyzing: false,
          d2dIsGenerating: false,
          d2dError: null,
        }),
    }),
    {
      name: "er-ai-studio-v4",
      partialize: (state) => ({
        user:                state.user,
        token:               state.token,
        isAuthenticated:     state.isAuthenticated,
        theme:               state.theme,
        selectedLanguage:    state.selectedLanguage,
        projects:            state.projects,
        activeProjectId:     state.activeProjectId,
        subscription:        state.subscription,
        quickHistory:        state.quickHistory,
        customColumns:       state.customColumns,
        globalPromptRules:   state.globalPromptRules,
        autoApplyToAllTools: state.autoApplyToAllTools,
      }),
    }
  )
);

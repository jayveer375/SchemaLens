import type { Subscription, PlanId } from "./types";
import { PLANS } from "./subscription";

// Feature access control based on subscription plans
export interface FeatureAccess {
  allowed: boolean;
  requiresPlan?: PlanId;
  message?: string;
}

// Define which features are available for each plan
export const FEATURE_PLANS: Record<string, PlanId[]> = {
  // Core features available to all plans
  "er_diagram_basic": ["free", "pro", "ultimate"],
  "sql_export_basic": ["free", "pro", "ultimate"], 
  "image_upload": ["free", "pro", "ultimate"],
  
  // D2D Features
  "d2d_basic": ["free", "pro", "ultimate"], // Basic D2D with flowchart only
  "d2d_er_diagram": ["pro", "ultimate"],    // ER diagrams in D2D
  "d2d_class_diagram": ["pro", "ultimate"], // Class diagrams  
  "d2d_advanced_diagrams": ["ultimate"],    // Sequence, architecture, etc.
  "d2d_sql_generation": ["pro", "ultimate"], // SQL generation from D2D
  
  // AI Assistant
  "ai_assistant_basic": ["free", "pro", "ultimate"], // Limited questions
  "ai_assistant_unlimited": ["ultimate"],             // Unlimited questions
  
  // Export Features
  "zip_export": ["pro", "ultimate"],
  "advanced_export": ["pro", "ultimate"],
  "sql_playground": ["pro", "ultimate"],
  
  // Project Features
  "version_history": ["pro", "ultimate"],
  "priority_queue": ["pro", "ultimate"],
  
  // Advanced Features
  "custom_columns": ["pro", "ultimate"],
  "batch_processing": ["ultimate"],
  "api_access": ["ultimate"],
  "white_label": ["ultimate"],
};

export function checkFeatureAccess(featureKey: string, subscription: Subscription): FeatureAccess {
  const allowedPlans = FEATURE_PLANS[featureKey];
  
  if (!allowedPlans) {
    return { allowed: true }; // Unknown features default to allowed
  }
  
  const userPlan = subscription.planId;
  const isAllowed = allowedPlans.includes(userPlan);
  
  if (isAllowed) {
    return { allowed: true };
  }
  
  // Find the minimum required plan
  const planOrder: PlanId[] = ["free", "pro", "ultimate"];
  const requiredPlan = allowedPlans.find(plan => planOrder.includes(plan)) || "pro";
  
  const messages: Record<string, string> = {
    "d2d_er_diagram": "ER diagrams in D2D require Pro plan. Upgrade to unlock database schema generation.",
    "d2d_class_diagram": "Class diagrams require Pro plan. Upgrade to create OOP class structures.",
    "d2d_advanced_diagrams": "Advanced diagrams (sequence, architecture) require Ultimate plan for complete system modeling.",
    "d2d_sql_generation": "SQL generation requires Pro plan. Upgrade to convert descriptions to executable SQL.",
    "sql_playground": "SQL Playground requires Pro plan. Upgrade to test and refine your queries.",
    "zip_export": "ZIP export requires Pro plan. Upgrade to download complete project archives.",
    "advanced_export": "Advanced export formats require Pro plan for professional documentation.",
    "ai_assistant_unlimited": "Unlimited AI questions require Ultimate plan. Free and Pro have usage limits.",
    "custom_columns": "Custom column templates require Pro plan for schema customization.",
    "version_history": "Version history requires Pro plan to track changes over time.",
    "priority_queue": "Priority processing requires Pro plan for faster generation.",
    "batch_processing": "Batch processing requires Ultimate plan for handling multiple files.",
    "api_access": "API access requires Ultimate plan for programmatic integration.",
  };
  
  return {
    allowed: false,
    requiresPlan: requiredPlan,
    message: messages[featureKey] || `This feature requires ${requiredPlan} plan. Upgrade to unlock.`
  };
}

// Specific checkers for common features
export function canUseSqlPlayground(subscription: Subscription): FeatureAccess {
  return checkFeatureAccess("sql_playground", subscription);
}

export function canUseD2DERDiagram(subscription: Subscription): FeatureAccess {
  return checkFeatureAccess("d2d_er_diagram", subscription);
}

export function canUseD2DAdvanced(subscription: Subscription): FeatureAccess {
  return checkFeatureAccess("d2d_advanced_diagrams", subscription);
}

export function canUseD2DSQL(subscription: Subscription): FeatureAccess {
  return checkFeatureAccess("d2d_sql_generation", subscription);
}

export function canExportZip(subscription: Subscription): FeatureAccess {
  return checkFeatureAccess("zip_export", subscription);
}

export function canUseAIUnlimited(subscription: Subscription): FeatureAccess {
  return checkFeatureAccess("ai_assistant_unlimited", subscription);
}

// D2D diagram type restrictions
export function getAvailableD2DDiagramTypes(subscription: Subscription) {
  const userPlan = subscription.planId;
  
  const basicTypes = [
    { key: "flowchart", label: "Flowchart", desc: "Process & decision flow", erType: "flowchart" as const },
  ];
  
  const proTypes = [
    { key: "er", label: "ER Diagram", desc: "Entities & relationships", erType: "er" as const },
    { key: "class", label: "Class Diagram", desc: "OOP class structure", erType: "class" as const },
  ];
  
  const ultimateTypes = [
    { key: "dfd", label: "Data Flow DFD", desc: "Data movement & stores", erType: "dfd1" as const },
    { key: "sequence", label: "Sequence", desc: "Time-based interactions", erType: "sequence" as const },
    { key: "architecture", label: "Architecture", desc: "System components", erType: "architecture" as const },
    { key: "usecase", label: "Use Case", desc: "User interactions", erType: "usecase" as const },
  ];
  
  switch (userPlan) {
    case "free":
      return { available: basicTypes, locked: [...proTypes, ...ultimateTypes] };
    case "pro":
      return { available: [...basicTypes, ...proTypes], locked: ultimateTypes };
    case "ultimate":
      return { available: [...basicTypes, ...proTypes, ...ultimateTypes], locked: [] };
    default:
      return { available: basicTypes, locked: [...proTypes, ...ultimateTypes] };
  }
}

// Usage limit helpers with restrictions
export function getFeatureUsageStatus(subscription: Subscription) {
  const plan = PLANS[subscription.planId];
  
  return {
    conversions: {
      used: subscription.conversionsUsedThisMonth,
      limit: plan.conversionsPerMonth,
      canUse: subscription.conversionsUsedThisMonth < plan.conversionsPerMonth
    },
    aiGenerations: {
      used: subscription.aiGenerationsUsedThisMonth,
      limit: plan.aiGenerationsPerMonth,
      canUse: subscription.aiGenerationsUsedThisMonth < plan.aiGenerationsPerMonth
    },
    projects: {
      limit: plan.maxProjects,
      unlimited: subscription.planId === "ultimate"
    },
    imagesPerProject: {
      limit: plan.maxImagesPerProject,
      unlimited: subscription.planId === "ultimate"
    }
  };
}
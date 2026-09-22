import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export default function BackButton({ onClick, label = "Go back", className = "" }: BackButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors ${className}`}
      title={label}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  );
}

// Icon-only back button for headers
export function BackButtonIcon({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${className}`}
      title="Go back"
    >
      <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
    </button>
  );
}
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { seedSuperAdmin } from "@/lib/auth";
import SmoothScroll from "@/components/layout/SmoothScroll";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const { theme } = useStore();

  useEffect(() => {
    seedSuperAdmin();
    // Apply the persisted theme immediately on mount
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, []);

  // Keep the class in sync whenever the user switches theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Also smooth-transition the background colour change
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScroll>
        {children}
      </SmoothScroll>
    </QueryClientProvider>
  );
}


"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { seedSuperAdmin } from "@/lib/auth";
import SmoothScroll from "@/components/layout/SmoothScroll";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
});

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export default function Providers({ children }: { children: React.ReactNode }) {
  const { theme } = useStore();

  useEffect(() => {
    seedSuperAdmin();
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <SmoothScroll>
          {children}
        </SmoothScroll>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}


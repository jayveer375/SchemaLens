import type { Metadata } from "next";
import "lenis/dist/lenis.css";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Schemalens – AI-Powered Database Schema Toolkit",
  description:
    "Convert ER diagrams to SQL, generate schemas from plain English, migrate between dialects, and write SQL live. Supports PostgreSQL, MySQL, SQLite, MSSQL & Oracle.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Flash-of-wrong-theme prevention: reads persisted store and applies .dark BEFORE paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('er-ai-studio-v4')||'{}');if((s.state||{}).theme==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: "var(--card)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                fontSize: "14px",
                fontFamily: "Inter, sans-serif",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              },
              success: {
                iconTheme: { primary: "#059669", secondary: "#ECFDF5" },
              },
              error: {
                iconTheme: { primary: "#DC2626", secondary: "#FEF2F2" },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}

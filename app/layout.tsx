import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";

export const metadata: Metadata = {
  title: "Career Matrix",
  description:
    "Local-first resume tailoring. Paste a job posting, tune the keyword match, edit the sheet in place, and export a one-page ATS resume — with an honest cover letter when the posting needs one.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

/**
 * Applied before first paint so a dark-mode reload never flashes white.
 * Kept tiny and dependency-free (no next-themes) because this app is local-only.
 */
const themeBootstrap = `(function(){try{var t=localStorage.getItem("vdcm.theme.v1");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <WorkspaceProvider>
          <div className="flex min-h-screen flex-col print:block">
            <Navbar />
            <main className="flex-1 print:block">{children}</main>
          </div>
          <Toaster position="bottom-right" richColors closeButton />
        </WorkspaceProvider>
      </body>
    </html>
  );
}

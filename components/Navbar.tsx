"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarDays, FileStack, Layers, LayoutDashboard, Mail, Moon, Sun, TrendingUp, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { cn } from "@/lib/utils";

/**
 * The order is the order of the work: the workspace first, then the three things you *make* from it — the letter,
 * the profile it draws on, the portfolio it feeds — then the record-keeping, which starts with the roles you have
 * saved and ends with the calendar they are dated on.
 */
const LINKS = [
  { href: "/", label: "Workspace", icon: LayoutDashboard },
  { href: "/cover-letter", label: "Cover Letter", icon: Mail },
  { href: "/profile", label: "Master Profile", icon: UserCog },
  { href: "/portfolio", label: "Portfolio", icon: Layers },
  { href: "/saved", label: "Saved Target Roles", icon: FileStack },
  { href: "/pipeline", label: "Pipeline", icon: TrendingUp },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

export function Navbar() {
  const pathname = usePathname();
  const { applications, theme, toggleTheme } = useWorkspace();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-[1800px] items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Briefcase className="h-4 w-4" />
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold tracking-tight">Career Matrix</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Resume tailoring engine
            </span>
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Button
                key={link.href}
                asChild
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn("gap-1.5", active && "font-semibold")}
              >
                <Link href={link.href}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{link.label}</span>
                  {link.href === "/saved" && applications.length > 0 ? (
                    <Badge variant={active ? "default" : "muted"} className="ml-1 h-4 px-1.5 text-[10px]">
                      {applications.length}
                    </Badge>
                  ) : null}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground lg:inline">
            Local-first · nothing leaves this machine
          </span>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

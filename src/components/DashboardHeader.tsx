import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Sun, Moon, Shield, UserCog, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { AppRole } from "@/types/supabase";

const ROLE_CONFIG: Record<AppRole, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  super_admin: {
    label: "Admin",
    className: "bg-primary/15 text-primary border-primary/30",
    icon: Shield,
  },
  operator: {
    label: "Operator",
    className: "bg-chart-3/15 text-chart-3 border-chart-3/30",
    icon: UserCog,
  },
  auditor: {
    label: "Auditor",
    className: "bg-warning/15 text-warning border-warning/30",
    icon: ClipboardCheck,
  },
};

export function DashboardHeader() {
  const { user, companyName, role, fullName } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  const displayName = fullName || user?.email?.split("@")[0] || "User";
  const initials = displayName.substring(0, 2).toUpperCase();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const roleConfig = role ? ROLE_CONFIG[role] : null;

  return (
    <header className="h-14 flex items-center justify-between border-b border-border/60 bg-card/80 backdrop-blur-sm px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          <span className="font-medium">{companyName || "Instansi Saya"}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
          onClick={toggleTheme}
          title={resolvedTheme === "dark" ? "Mode Siang" : "Mode Malam"}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        <div className="hidden sm:flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium leading-none text-foreground">
              {displayName}
            </p>
            {roleConfig && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 leading-4 ${roleConfig.className}`}>
                <roleConfig.icon className="h-2.5 w-2.5 mr-0.5" />
                {roleConfig.label}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{user?.email || ""}</p>
        </div>
        <Avatar className="h-8 w-8 ring-2 ring-border/40">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

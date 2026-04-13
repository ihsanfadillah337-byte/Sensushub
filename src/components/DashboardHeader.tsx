import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

export function DashboardHeader() {
  const { user, companyName } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??";

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

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
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium leading-none text-foreground">
            {user?.email?.split("@")[0] || "User"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{user?.email || ""}</p>
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


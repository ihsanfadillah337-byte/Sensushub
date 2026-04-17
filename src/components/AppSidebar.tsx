import { LayoutDashboard, Package, Settings, LogOut, AlertCircle, ClipboardCheck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/types/supabase";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Which roles can see this menu item */
  roles: AppRole[];
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard/overview", icon: LayoutDashboard, roles: ["super_admin", "operator"] },
  { title: "Daftar Aset", url: "/dashboard/assets", icon: Package, roles: ["super_admin", "operator"] },
  { title: "Laporan Kendala", url: "/dashboard/reports", icon: AlertCircle, roles: ["super_admin", "operator"] },
  { title: "Pengaturan", url: "/dashboard/settings", icon: Settings, roles: ["super_admin"] },
  { title: "Sensus Lapangan", url: "/dashboard/census", icon: ClipboardCheck, roles: ["super_admin", "auditor"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user, role } = useAuth();

  // Filter menu items based on user's role
  const visibleMenuItems = menuItems.filter(
    (item) => role && item.roles.includes(role)
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shadow-sm">
              <Package className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <span className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">
              SensusHub
            </span>
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shadow-sm mx-auto">
            <Package className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40 font-semibold">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="rounded-lg transition-all duration-150 hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="rounded-lg transition-all duration-150 hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Keluar</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && user && (
          <p className="text-[10px] text-sidebar-foreground/30 truncate px-2 mt-1">{user.email}</p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

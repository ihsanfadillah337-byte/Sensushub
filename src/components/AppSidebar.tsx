import { LayoutDashboard, Package, Settings, LogOut, Scale, Users, FileSignature, FileCheck2, ShieldCheck } from "lucide-react";
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
  { title: "Dashboard", url: "/dashboard/overview", icon: LayoutDashboard, roles: ["super_admin", "operator", "staf_bkad"] },
  { title: "Daftar Aset", url: "/dashboard/assets", icon: Package, roles: ["super_admin", "operator", "staf_bkad"] },
  { title: "Verifikasi BKAD", url: "/dashboard/verifikasi-bkad", icon: ShieldCheck, roles: ["staf_bkad"] },
  { title: "Rekonsiliasi Aset", url: "/dashboard/rekonsiliasi", icon: Scale, roles: ["super_admin", "operator"] },
  { title: "Pengajuan Surat", url: "/dashboard/pengajuan-surat", icon: FileSignature, roles: ["super_admin"] },
  { title: "Arsip Berita Acara", url: "/dashboard/finalisasi-rekon", icon: FileCheck2, roles: ["super_admin"] },
  { title: "Manajemen Pengguna", url: "/dashboard/users", icon: Users, roles: ["super_admin"] },
  { title: "Pengaturan", url: "/dashboard/settings", icon: Settings, roles: ["super_admin"] },
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
    <Sidebar collapsible="icon" className="border-r border-slate-200 bg-white dark:border-sidebar-border dark:bg-sidebar">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 shrink-0">
              <Package className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                SIPPA-BMD
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight font-normal">
                Sistem Inventarisasi, Pengawasan &amp; Pelaporan Aset - Barang Milik Daerah
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 mx-auto">
            <Package className="h-4 w-4 text-white" />
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
                      className="rounded-md transition-colors duration-150 text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground"
                      activeClassName="bg-blue-50 text-blue-700 font-medium dark:bg-sidebar-accent dark:text-sidebar-accent-foreground"
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
              className="rounded-md transition-colors duration-150 hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-destructive"
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

import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { CustomColumnsProvider } from "@/contexts/CustomColumnsContext";

export default function DashboardLayout() {
  const location = useLocation();
  return (
    <CustomColumnsProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-slate-50/60">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <DashboardHeader />
            <main key={location.pathname} className="flex-1 p-3 sm:p-4 lg:p-5 overflow-auto animate-soft-in">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </CustomColumnsProvider>
  );
}

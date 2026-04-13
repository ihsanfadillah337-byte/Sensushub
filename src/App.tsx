import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";
import DashboardOverview from "./pages/DashboardOverview";
import DashboardAssets from "./pages/DashboardAssets";
import DashboardAssetsNew from "./pages/DashboardAssetsNew";
import DashboardAssetEdit from "./pages/DashboardAssetEdit";
import DashboardSettings from "./pages/DashboardSettings";
import DashboardReports from "./pages/DashboardReports";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ScanAsset from "./pages/ScanAsset";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard/assets" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="overview" element={<DashboardOverview />} />
              <Route path="assets" element={<DashboardAssets />} />
              <Route path="assets/new" element={<DashboardAssetsNew />} />
              <Route path="assets/:id/edit" element={<DashboardAssetEdit />} />
              <Route path="reports" element={<DashboardReports />} />
              <Route path="settings" element={<DashboardSettings />} />
              <Route index element={<Navigate to="overview" replace />} />
            </Route>
            <Route path="/scan/:id" element={<ScanAsset />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

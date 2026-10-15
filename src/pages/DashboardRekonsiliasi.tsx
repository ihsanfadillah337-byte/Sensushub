import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, ClipboardCheck, Scale } from "lucide-react";
import DashboardReports from "./DashboardReports";
import DashboardCensus from "./DashboardCensus";
import PapanRekonsiliasi from "./PapanRekonsiliasi";

const mainTabs = [
  { key: "inbox", label: "Laporan Masuk", icon: Inbox },
  { key: "sensus", label: "Sensus Lapangan", icon: ClipboardCheck },
  { key: "papan", label: "Papan Rekonsiliasi", icon: Scale },
] as const;

type TabKey = (typeof mainTabs)[number]["key"];

export default function DashboardRekonsiliasi() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = (searchParams.get("tab") as TabKey) || "inbox";
  const initialTab = mainTabs.some(t => t.key === defaultTab) ? defaultTab : "inbox";
  
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey;
    if (tab && mainTabs.some(t => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          Rekonsiliasi Aset
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Kelola tiket laporan publik, sensus lapangan, dan proses rekonsiliasi data aset.
        </p>
      </div>

      {/* ── Main Tab Bar (Vercel / GitHub underline style) ── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`relative flex items-center gap-2 px-4 sm:px-5 py-3 text-sm font-medium transition-colors
                  ${isActive
                    ? "text-blue-700"
                    : "text-gray-500 hover:text-gray-900"
                  }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
                {/* Active underline indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab Content ── */}
      <div className="focus-visible:outline-none">
        {activeTab === "inbox" && <DashboardReports />}
        {activeTab === "sensus" && <DashboardCensus />}
        {activeTab === "papan" && <PapanRekonsiliasi />}
      </div>
    </div>
  );
}

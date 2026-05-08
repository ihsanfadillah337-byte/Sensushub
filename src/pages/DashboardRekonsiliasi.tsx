import { useState } from "react";
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
  const [activeTab, setActiveTab] = useState<TabKey>("inbox");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          Rekonsiliasi Aset
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Kelola tiket laporan publik, sensus lapangan, dan proses rekonsiliasi data aset.
        </p>
      </div>

      {/* ── Main Tab Bar (Vercel / GitHub underline style) ── */}
      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 px-4 sm:px-5 py-3 text-sm font-medium transition-colors
                  ${isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
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

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, ClipboardCheck, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import DashboardReports from "./DashboardReports";
import DashboardCensus from "./DashboardCensus";

export default function DashboardRekonsiliasi() {
  const [activeTab, setActiveTab] = useState("inbox");

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

      {/* Unified Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 inline-flex w-full sm:w-auto h-auto flex-wrap">
          <TabsTrigger
            value="inbox"
            className="gap-2 px-4 sm:px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Laporan</span> Masuk
          </TabsTrigger>
          <TabsTrigger
            value="sensus"
            className="gap-2 px-4 sm:px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <ClipboardCheck className="h-4 w-4" />
            Sensus <span className="hidden sm:inline">Lapangan</span>
          </TabsTrigger>
          <TabsTrigger
            value="papan"
            className="gap-2 px-4 sm:px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Scale className="h-4 w-4" />
            Papan <span className="hidden sm:inline">Rekonsiliasi</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Laporan Masuk (from DashboardReports) */}
        <TabsContent value="inbox" className="mt-6 focus-visible:outline-none focus-visible:ring-0">
          <DashboardReports />
        </TabsContent>

        {/* Tab 2: Sensus Lapangan (from DashboardCensus) */}
        <TabsContent value="sensus" className="mt-6 focus-visible:outline-none focus-visible:ring-0">
          <DashboardCensus />
        </TabsContent>

        {/* Tab 3: Papan Rekonsiliasi (Placeholder) */}
        <TabsContent value="papan" className="mt-6 focus-visible:outline-none focus-visible:ring-0">
          <Card className="border-border/60 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Scale className="h-8 w-8 text-primary/60" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Papan Rekonsiliasi</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Fitur ini akan menampilkan daftar aset yang perlu direkonsiliasi
                antara data lapangan (tiket + audit) dengan data master SIMDA.
              </p>
              <Badge variant="outline" className="mt-4 text-xs">
                Segera Hadir
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

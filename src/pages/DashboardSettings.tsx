import { Plus, Trash2, Columns3, AlertCircle, ChevronDown, ChevronUp, Building2, FolderOpen, Lock, Unlock, GripVertical, KeyRound, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { useCustomColumns, type CodedOption, type CustomColumn, type TreeNode } from "@/contexts/CustomColumnsContext";
import MasterDataSection from "@/components/settings/MasterDataSection";
import CodeBuilder from "@/components/settings/CodeBuilder";
import TreeBuilder from "@/components/settings/TreeBuilder";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const MAX_COLUMNS = 10;

function countTreeNodes(nodes: TreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count++;
    if (n.children) count += countTreeNodes(n.children);
  }
  return count;
}

const typeLabels: Record<string, string> = {
  text: "Text", number: "Number", date: "Date", coded_dropdown: "Dropdown Berkode",
};
const typeBadgeClass: Record<string, string> = {
  text: "bg-accent text-accent-foreground", number: "bg-secondary text-secondary-foreground",
  date: "bg-muted text-muted-foreground", coded_dropdown: "bg-primary/10 text-primary",
};

function SortableColumnItem({ col, index, isLocked, expandedCol, setExpandedCol, onRemove, onEdit }: {
  col: CustomColumn; index: number; isLocked: boolean;
  expandedCol: string | null; setExpandedCol: (id: string | null) => void;
  onRemove: (id: string) => void;
  onEdit: (col: CustomColumn) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id, disabled: isLocked });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className="group">
      <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => col.type === "coded_dropdown" && setExpandedCol(expandedCol === col.id ? null : col.id)}>
        <div className="flex items-center gap-2">
          {!isLocked && (
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5 -ml-1">
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="text-xs text-muted-foreground tabular-nums w-5">{index + 1}.</span>
          <span className="text-sm font-medium text-foreground">{col.name}</span>
          <Badge variant="secondary" className={`text-[10px] ${typeBadgeClass[col.type]}`}>{typeLabels[col.type]}</Badge>
          {col.type === "coded_dropdown" && col.options && !col.options_tree && (
            <span className="text-[10px] text-muted-foreground">({col.options.length} opsi)</span>
          )}
          {col.type === "coded_dropdown" && col.options_tree && (
            <span className="text-[10px] text-muted-foreground">({col.dropdown_levels?.length || 1} level)</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {col.type === "coded_dropdown" && (expandedCol === col.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />)}
          {!isLocked && (
            <div className="flex items-center gap-1">
               <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary transition-colors"
                 onClick={(e) => { e.stopPropagation(); onEdit(col); }} title="Edit Kolom">
                 <Pencil className="h-3 w-3" />
               </Button>
               <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors"
                 onClick={(e) => { e.stopPropagation(); onRemove(col.id); }} title="Hapus Kolom">
                 <Trash2 className="h-3.5 w-3.5" />
               </Button>
            </div>
          )}
        </div>
      </div>
      {col.type === "coded_dropdown" && expandedCol === col.id && col.options_tree && col.dropdown_levels && (
        <div className="px-5 pb-3 pl-14">
          <div className="rounded border border-border bg-muted/20 p-2 space-y-1">
            {(col.dropdown_levels || []).map((lv, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="font-mono text-muted-foreground bg-muted px-1 rounded">L{i + 1}</span>
                <span className="text-foreground">{lv || `Level ${i + 1}`}</span>
              </div>
            ))}
            <div className="text-[10px] text-muted-foreground mt-1 pt-1 border-t border-border/50">Tree: {countTreeNodes(col.options_tree || [])} node</div>
          </div>
        </div>
      )}
      {col.type === "coded_dropdown" && expandedCol === col.id && col.options && !col.options_tree && (
        <div className="px-5 pb-3 pl-14">
          <div className="rounded border border-border bg-muted/20 divide-y divide-border">
            {(col.options || []).map((o, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className="font-mono text-muted-foreground w-12">{o.code}</span>
                <span className="text-foreground">{o.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export default function DashboardSettings() {
  const { kibColumns, setKibColumns, masterDivisi, setMasterDivisi, masterKib, setMasterKib, settingsPin, setSettingsPin } = useCustomColumns();

  const [selectedKibKey, setSelectedKibKey] = useState<string>("");
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("");
  const [codedOptions, setCodedOptions] = useState<CodedOption[]>([]);
  const [treeBuilderLevels, setTreeBuilderLevels] = useState<string[]>(["Level 1"]);
  const [treeBuilderNodes, setTreeBuilderNodes] = useState<TreeNode[]>([]);
  const [expandedCol, setExpandedCol] = useState<string | null>(null);
  const [codeBuilderKib, setCodeBuilderKib] = useState<string | null>(null);

  // Lock/PIN state
  const [isLocked, setIsLocked] = useState(true);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");

  // Change PIN state
  const [changePinDialogOpen, setChangePinDialogOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const currentColumns = selectedKibKey ? (kibColumns[selectedKibKey] || []) : [];
  const isMaxReached = currentColumns.length >= MAX_COLUMNS;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleUnlock = () => {
    if (pinInput === (settingsPin || "123456")) {
      setIsLocked(false);
      setPinDialogOpen(false);
      setPinInput("");
      toast.success("Pengaturan berhasil dibuka.");
    } else {
      toast.error("PIN salah.");
    }
  };

  const handleAddOption = () => setCodedOptions((prev) => [...prev, { label: "", code: "" }]);
  const handleRemoveOption = (idx: number) => setCodedOptions((prev) => prev.filter((_, i) => i !== idx));
  const handleOptionChange = (idx: number, field: "label" | "code", value: string) => {
    setCodedOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o)));
  };

  const handleEdit = (col: CustomColumn) => {
    setEditingColId(col.id);
    setNewName(col.name);
    setNewType(col.type);
    if (col.type === "coded_dropdown") {
      setCodedOptions(col.options || []);
      setTreeBuilderLevels(col.dropdown_levels || ["Level 1"]);
      setTreeBuilderNodes(col.options_tree || []);
    } else {
      setCodedOptions([]);
      setTreeBuilderLevels(["Level 1"]);
      setTreeBuilderNodes([]);
    }
    // Scroll to top to ensure user sees the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingColId(null);
    setNewName("");
    setNewType("");
    setCodedOptions([]);
    setTreeBuilderLevels(["Level 1"]);
    setTreeBuilderNodes([]);
  };

  const handleSaveColumn = () => {
    if (!selectedKibKey) { toast.error("Pilih KIB terlebih dahulu."); return; }
    if (!newName.trim()) { toast.error("Nama kolom wajib diisi."); return; }
    if (!newType) { toast.error("Pilih tipe data terlebih dahulu."); return; }
    
    // Validasi duplikat nama kolom (kecuali untuk dirinya sendiri jika sedang edit)
    const isDuplicate = currentColumns.some((c) => 
      c.name.toLowerCase() === newName.trim().toLowerCase() && c.id !== editingColId
    );
    if (isDuplicate) { 
      toast.error("Nama kolom sudah digunakan."); 
      return; 
    }
    
    let newCol: CustomColumn;
    if (newType === "coded_dropdown") {
      // Check if tree mode (has levels defined)
      if (treeBuilderLevels.length > 0 && treeBuilderNodes.length > 0) {
        newCol = {
          id: crypto.randomUUID(),
          name: newName.trim(),
          type: "coded_dropdown",
          dropdown_levels: treeBuilderLevels.map((l) => l.trim() || `Level`),
          options_tree: treeBuilderNodes,
        };
      } else {
        const valid = codedOptions.filter((o) => o.label.trim() && o.code.trim());
        if (valid.length < 1) { toast.error("Tambahkan minimal 1 opsi."); return; }
        newCol = { id: crypto.randomUUID(), name: newName.trim(), type: "coded_dropdown", options: valid.map((o) => ({ label: o.label.trim(), code: o.code.trim() })) };
      }
    } else {
      newCol = { id: editingColId || crypto.randomUUID(), name: newName.trim(), type: newType as "text" | "number" | "date" };
    }
    
    setKibColumns((prev) => {
       const cols = prev[selectedKibKey] || [];
       if (editingColId) {
         return { ...prev, [selectedKibKey]: cols.map(c => c.id === editingColId ? newCol : c) };
       } else {
         return { ...prev, [selectedKibKey]: [...cols, newCol] };
       }
    });
    
    cancelEdit();
    toast.success(editingColId ? `Kolom "${newCol.name}" berhasil diperbarui.` : `Kolom "${newCol.name}" berhasil ditambahkan.`);
  };

  const handleRemove = (id: string) => {
    if (!selectedKibKey) return;
    setKibColumns((prev) => ({ ...prev, [selectedKibKey]: (prev[selectedKibKey] || []).filter((c) => c.id !== id) }));
    toast.info("Kolom berhasil dihapus.");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedKibKey) return;
    setKibColumns((prev) => {
      const cols = prev[selectedKibKey] || [];
      const oldIndex = cols.findIndex((c) => c.id === active.id);
      const newIndex = cols.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, [selectedKibKey]: arrayMove(cols, oldIndex, newIndex) };
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Pengaturan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Konfigurasi master data dan kolom custom untuk data aset Anda.</p>
      </div>

      <MasterDataSection title="Master Divisi / Satuan Kerja" icon={<Building2 className="h-4 w-4 text-primary" />} items={masterDivisi} setItems={setMasterDivisi} labelPlaceholder="cth: Bagian Umum" codePlaceholder="cth: 01" />
      <MasterDataSection title="Master KIB" icon={<FolderOpen className="h-4 w-4 text-primary" />} items={masterKib} setItems={setMasterKib} labelPlaceholder="cth: Peralatan dan Mesin" codePlaceholder="cth: 02" onEditCode={(kibLabel) => setCodeBuilderKib(kibLabel)} />

      {/* Custom Columns per KIB */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Columns3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Pengaturan Kolom Custom</h2>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs tabular-nums">{currentColumns.length}/{MAX_COLUMNS}</Badge>
            {!isLocked && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ubah PIN" onClick={() => setChangePinDialogOpen(true)}>
                <KeyRound className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (isLocked) { setPinDialogOpen(true); } else { setIsLocked(true); } }}>
              {isLocked ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Unlock className="h-4 w-4 text-primary" />}
            </Button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* KIB Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Pilih KIB untuk mengelola kolom</Label>
            <Select value={selectedKibKey} onValueChange={setSelectedKibKey}>
              <SelectTrigger><SelectValue placeholder="Pilih KIB..." /></SelectTrigger>
              <SelectContent>
                {masterKib.map((k) => (
                  <SelectItem key={k.id} value={k.label}>
                    <span className="font-mono text-muted-foreground mr-2">{k.code}</span>{k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedKibKey && !isLocked && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-3 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="col-name" className="text-xs font-medium text-muted-foreground">Nama Kolom</Label>
                  <Input id="col-name" placeholder="cth: Tahun Perolehan" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={isMaxReached} onKeyDown={(e) => e.key === "Enter" && newType !== "coded_dropdown" && handleAdd()} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="col-type" className="text-xs font-medium text-muted-foreground">Tipe Data</Label>
                  <Select value={newType} onValueChange={(v) => { setNewType(v); if (v !== "coded_dropdown") setCodedOptions([]); }} disabled={isMaxReached}>
                    <SelectTrigger id="col-type"><SelectValue placeholder="Pilih tipe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="coded_dropdown">Dropdown Berkode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingColId ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1.5 justify-center flex-1" onClick={handleSaveColumn}>
                      <Check className="h-4 w-4" /> Simpan
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={cancelEdit}>
                      <X className="h-4 w-4" /> Batal
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" className="gap-1.5 w-full justify-center" onClick={handleSaveColumn} disabled={isMaxReached}>
                    <Plus className="h-4 w-4" /> Tambah
                  </Button>
                )}
              </div>

              {newType === "coded_dropdown" && (
                <TreeBuilder
                  levels={treeBuilderLevels}
                  tree={treeBuilderNodes}
                  onLevelsChange={setTreeBuilderLevels}
                  onTreeChange={setTreeBuilderNodes}
                />
              )}

              {isMaxReached && (
                <div className="flex items-center gap-2 text-xs text-warning rounded-md bg-warning/10 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />Batas maksimal {MAX_COLUMNS} kolom custom telah tercapai.
                </div>
              )}
            </>
          )}

          {selectedKibKey && isLocked && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
              <Lock className="h-3.5 w-3.5 shrink-0" />Klik ikon gembok untuk membuka pengaturan kolom.
            </div>
          )}

          {!selectedKibKey && masterKib.length > 0 && (
            <div className="rounded-md border border-dashed border-border py-6 flex flex-col items-center text-muted-foreground">
              <Columns3 className="h-6 w-6 mb-1 opacity-30" />
              <p className="text-xs font-medium">Pilih KIB di atas</p>
              <p className="text-[11px] mt-0.5 opacity-70">Kolom custom dikelompokkan berdasarkan KIB.</p>
            </div>
          )}

          {!selectedKibKey && masterKib.length === 0 && (
            <div className="rounded-md border border-dashed border-border py-6 flex flex-col items-center text-muted-foreground">
              <Columns3 className="h-6 w-6 mb-1 opacity-30" />
              <p className="text-xs font-medium">Tambahkan Master KIB dulu</p>
              <p className="text-[11px] mt-0.5 opacity-70">Kolom custom memerlukan Master KIB.</p>
            </div>
          )}
        </div>

        {selectedKibKey && currentColumns.length > 0 && (
          <div className="border-t border-border">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={currentColumns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-border">
                  {currentColumns.map((col, index) => (
                    <SortableColumnItem key={col.id} col={col} index={index} isLocked={isLocked} expandedCol={expandedCol} setExpandedCol={setExpandedCol} onRemove={handleRemove} onEdit={handleEdit} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {selectedKibKey && currentColumns.length === 0 && (
          <div className="px-5 pb-5">
            <div className="rounded-md border border-dashed border-border py-8 flex flex-col items-center text-muted-foreground">
              <Columns3 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs font-medium">Belum ada kolom custom untuk KIB ini</p>
              <p className="text-[11px] mt-0.5 opacity-70">{isLocked ? "Buka gembok untuk menambah kolom." : "Tambahkan kolom di atas."}</p>
            </div>
          </div>
        )}
      </div>

      {/* PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Masukkan PIN Pengaturan</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">PIN</Label>
            <Input type="password" placeholder="Masukkan PIN..." value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleUnlock()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinDialogOpen(false); setPinInput(""); }}>Batal</Button>
            <Button onClick={handleUnlock}>Buka</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={changePinDialogOpen} onOpenChange={setChangePinDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ubah PIN Pengaturan</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">PIN Baru</Label>
              <Input type="password" placeholder="Masukkan PIN baru..." value={newPin} onChange={(e) => setNewPin(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Konfirmasi PIN Baru</Label>
              <Input type="password" placeholder="Ulangi PIN baru..." value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (!newPin.trim() || newPin.length < 4) { toast.error("PIN minimal 4 karakter."); return; }
                  if (newPin !== confirmPin) { toast.error("Konfirmasi PIN tidak cocok."); return; }
                  setSettingsPin(newPin);
                  setChangePinDialogOpen(false);
                  setNewPin(""); setConfirmPin("");
                  toast.success("PIN berhasil diubah!");
                }
              }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangePinDialogOpen(false); setNewPin(""); setConfirmPin(""); }}>Batal</Button>
            <Button onClick={() => {
              if (!newPin.trim() || newPin.length < 4) { toast.error("PIN minimal 4 karakter."); return; }
              if (newPin !== confirmPin) { toast.error("Konfirmasi PIN tidak cocok."); return; }
              setSettingsPin(newPin);
              setChangePinDialogOpen(false);
              setNewPin(""); setConfirmPin("");
              toast.success("PIN berhasil diubah!");
            }}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Per-KIB Code Builder Dialog */}
      <Dialog open={!!codeBuilderKib} onOpenChange={(open) => { if (!open) setCodeBuilderKib(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              Format Kode Aset — {codeBuilderKib}
            </DialogTitle>
          </DialogHeader>
          {codeBuilderKib && <CodeBuilder kibLabel={codeBuilderKib} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

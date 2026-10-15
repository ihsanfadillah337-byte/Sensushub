import { Plus, Trash2, Pencil, Check, X, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import type { MasterItem } from "@/contexts/CustomColumnsContext";

interface MasterDataSectionProps {
  title: string;
  icon: React.ReactNode;
  items: MasterItem[];
  setItems: (items: MasterItem[] | ((prev: MasterItem[]) => MasterItem[])) => void;
  labelPlaceholder?: string;
  codePlaceholder?: string;
  onEditCode?: (kibLabel: string) => void;
}

export default function MasterDataSection({
  title,
  icon,
  items,
  setItems,
  labelPlaceholder = "cth: Bagian Umum",
  codePlaceholder = "cth: 01",
  onEditCode,
}: MasterDataSectionProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newCode, setNewCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCode, setEditCode] = useState("");

  const handleAdd = () => {
    if (!newLabel.trim() || !newCode.trim()) {
      toast.error("Label dan Kode wajib diisi.");
      return;
    }
    if (items.some((i) => i.code === newCode.trim())) {
      toast.error("Kode sudah digunakan.");
      return;
    }
    setItems((prev) => [...prev, { id: crypto.randomUUID(), label: newLabel.trim(), code: newCode.trim() }]);
    setNewLabel("");
    setNewCode("");
    toast.success("Data berhasil ditambahkan.");
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.info("Data berhasil dihapus.");
  };

  const startEdit = (item: MasterItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditCode(item.code);
  };

  const saveEdit = () => {
    if (!editLabel.trim() || !editCode.trim()) {
      toast.error("Label dan Kode wajib diisi.");
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === editingId ? { ...i, label: editLabel.trim(), code: editCode.trim() } : i))
    );
    setEditingId(null);
    toast.success("Data berhasil diperbarui.");
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        {icon}
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <Badge variant="outline" className="ml-auto px-2 py-0.5 text-[11px] font-semibold rounded border bg-slate-100 text-slate-700 border-slate-200 tabular-nums">
          {items.length}
        </Badge>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Label</label>
            <Input placeholder={labelPlaceholder} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          </div>
          <div className="w-28 space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Kode</label>
            <Input placeholder={codePlaceholder} value={newCode} onChange={(e) => setNewCode(e.target.value)} className="font-mono" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          </div>
          <Button size="sm" className="gap-1.5 h-9" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Tambah</span>
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="border-t border-gray-200">
          <ul className="divide-y divide-gray-200">
            {items.map((item, index) => (
              <li key={item.id} className="group flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                {editingId === item.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-gray-500 tabular-nums w-5">{index + 1}.</span>
                    <Input className="h-7 text-xs flex-1" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                    <Input className="h-7 text-xs w-20 font-mono" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-700" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 tabular-nums w-5">{index + 1}.</span>
                      <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{item.code}</span>
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {onEditCode && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-blue-700 transition-opacity" onClick={() => onEditCode(item.label)} title="Format Kode Aset">
                          <Hash className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-blue-700 transition-opacity" onClick={() => startEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity" onClick={() => handleRemove(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && (
        <div className="px-5 pb-5">
          <div className="rounded-md border border-dashed border-gray-200 py-6 flex flex-col items-center text-gray-500">
            <p className="text-xs font-medium">Belum ada data</p>
            <p className="text-xs mt-0.5 text-gray-500">Tambahkan item di atas.</p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Layers, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { TreeNode } from "@/contexts/CustomColumnsContext";

/* ─── Delete Guard Component ─── */
function DeleteGuardDialog({ open, onOpenChange, onConfirm, title, description }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-red-500 font-medium">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Hapus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── Recursive Tree Node Editor ─── */
function TreeNodeEditor({
  node,
  depth,
  maxDepth,
  levelNames,
  onUpdate,
  onRemove,
}: {
  node: TreeNode;
  depth: number;
  maxDepth: number;
  levelNames: string[];
  onUpdate: (updated: TreeNode) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [deleteGuardOpen, setDeleteGuardOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<boolean>(false);
  const [editLabel, setEditLabel] = useState("");
  const [editCode, setEditCode] = useState("");

  const hasChildren = node.children && node.children.length > 0;
  const canAddChild = depth < maxDepth - 1;

  const updateChild = (idx: number, updated: TreeNode) => {
    const newChildren = [...(node.children || [])];
    newChildren[idx] = updated;
    onUpdate({ ...node, children: newChildren });
  };

  const removeChild = (idx: number) => {
    const newChildren = (node.children || []).filter((_, i) => i !== idx);
    onUpdate({ ...node, children: newChildren.length > 0 ? newChildren : undefined });
  };

  const addChild = () => {
    const newChildren = [...(node.children || []), { label: "", code: "" }];
    onUpdate({ ...node, children: newChildren });
    setExpanded(true);
  };

  const handleRemoveClick = () => {
    if (hasChildren) {
      setDeleteGuardOpen(true);
    } else {
      onRemove();
    }
  };

  const startEditing = () => {
    setEditLabel(node.label);
    setEditCode(node.code);
    setEditingNode(true);
  };

  const saveEdit = () => {
    onUpdate({ ...node, label: editLabel, code: editCode });
    setEditingNode(false);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 group" style={{ paddingLeft: `${depth * 20}px` }}>
        {hasChildren ? (
          <button
            className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 tabular-nums opacity-60">
          L{depth + 1}
        </Badge>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          {node.code ? <span className="font-mono text-xs text-muted-foreground shrink-0">{node.code}</span> : null}
          <span className="text-sm truncate">{node.label || <span className="text-muted-foreground italic text-xs">Kosong</span>}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={startEditing}
          title="Edit Node"
        >
          <Pencil className="h-3 w-3" />
        </Button>

        {canAddChild && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-primary hover:text-primary/80 shrink-0"
            onClick={addChild}
            title={`Tambah sub-opsi ${levelNames[depth + 1] || ""}`}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={handleRemoveClick}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Edit Node Modal */}
      <Dialog open={editingNode} onOpenChange={setEditingNode}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Opsi {levelNames[depth] || `Level ${depth + 1}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Contoh: Mesin" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Kode</label>
              <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="Contoh: 01" className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNode(false)}>Batal</Button>
            <Button onClick={saveEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteGuardDialog 
        open={deleteGuardOpen} 
        onOpenChange={setDeleteGuardOpen} 
        onConfirm={() => { setDeleteGuardOpen(false); onRemove(); }}
        title="Hapus Induk Opsi?"
        description="Peringatan: Node ini memiliki sub-cabang di bawahnya. Menghapus node ini akan melenyapkan seluruh data turunannya secara permanen!"
      />

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, idx) => (
            <TreeNodeEditor
              key={idx}
              node={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              levelNames={levelNames}
              onUpdate={(updated) => updateChild(idx, updated)}
              onRemove={() => removeChild(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Level Editor Item ─── */
function LevelItem({ idx, level, onUpdate, onRemove }: { idx: number; level: string; onUpdate: (val: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(level);

  const save = () => {
    onUpdate(val);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 group">
      <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 tabular-nums">
        L{idx + 1}
      </Badge>
      
      {editing ? (
        <div className="flex-1 flex items-center gap-1">
          <Input 
            className="h-7 text-xs flex-1" 
            placeholder={`Nama level ${idx + 1}`} 
            value={val} 
            onChange={(e) => setVal(e.target.value)} 
            autoFocus 
            onKeyDown={(e) => e.key === "Enter" && save()} 
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary shrink-0" onClick={save}><Check className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground shrink-0" onClick={() => { setVal(level); setEditing(false); }}><X className="h-3.5 w-3.5" /></Button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-between">
          <span className="text-xs">{level || <span className="text-muted-foreground italic">Level {idx + 1}</span>}</span>
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={onRemove}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Tree Builder Component ─── */
interface TreeBuilderProps {
  levels: string[];
  tree: TreeNode[];
  onLevelsChange: (levels: string[]) => void;
  onTreeChange: (tree: TreeNode[]) => void;
}

export default function TreeBuilder({ levels, tree, onLevelsChange, onTreeChange }: TreeBuilderProps) {
  const [deleteLevelGuard, setDeleteLevelGuard] = useState<{ open: boolean; idx: number | null }>({ open: false, idx: null });

  const addLevel = () => {
    onLevelsChange([...levels, ""]);
  };

  const removeLevelConfirm = (idx: number) => {
    if (levels.length <= 1) return;
    
    // Check if there are deeper nodes that would be lost
    const wouldLoseNodes = (nodes: TreeNode[], targetDepth: number, currentDepth: number): boolean => {
      for (const n of nodes) {
        if (currentDepth >= targetDepth) return true;
        if (n.children && wouldLoseNodes(n.children, targetDepth, currentDepth + 1)) return true;
      }
      return false;
    };

    if (wouldLoseNodes(tree, idx, 0)) {
      setDeleteLevelGuard({ open: true, idx });
    } else {
      executeRemoveLevel(idx);
    }
  };

  const executeRemoveLevel = (idx: number) => {
    onLevelsChange(levels.filter((_, i) => i !== idx));
    const pruneDepth = (nodes: TreeNode[], maxDepth: number, currentDepth: number): TreeNode[] => {
      if (currentDepth >= maxDepth) return [];
      return nodes.map((n) => ({
        ...n,
        children: n.children ? pruneDepth(n.children, maxDepth, currentDepth + 1) : undefined,
      }));
    };
    onTreeChange(pruneDepth(tree, idx, 0));
  };

  const updateLevelName = (idx: number, name: string) => {
    onLevelsChange(levels.map((l, i) => (i === idx ? name : l)));
  };

  const addRootNode = () => {
    onTreeChange([...tree, { label: "Opsi Baru", code: "" }]);
  };

  const updateRootNode = (idx: number, updated: TreeNode) => {
    const newTree = [...tree];
    newTree[idx] = updated;
    onTreeChange(newTree);
  };

  const removeRootNode = (idx: number) => {
    onTreeChange(tree.filter((_, i) => i !== idx));
  };

  // Count total nodes
  const countNodes = (nodes: TreeNode[]): number => {
    let count = 0;
    for (const n of nodes) {
      count++;
      if (n.children) count += countNodes(n.children);
    }
    return count;
  };

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
      <DeleteGuardDialog 
        open={deleteLevelGuard.open} 
        onOpenChange={(open) => setDeleteLevelGuard((p) => ({ ...p, open }))}
        onConfirm={() => {
          if (deleteLevelGuard.idx !== null) executeRemoveLevel(deleteLevelGuard.idx);
          setDeleteLevelGuard({ open: false, idx: null });
        }}
        title="Hapus Level & Semuanya?"
        description="Node pada hirarki level ini telah terisi. Menghapus level berarti Anda akan memangkas seluruh struktur sub-cabang mulai dari kedalaman ini ke bawah secara permanen."
      />

      {/* Level Definition */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Level Dropdown
          </p>
          <Button size="sm" variant="outline" className="gap-1 h-6 text-[10px]" onClick={addLevel}>
            <Plus className="h-3 w-3" /> Level
          </Button>
        </div>
        <div className="space-y-1">
          {levels.map((level, idx) => (
            <LevelItem 
              key={idx} 
              idx={idx} 
              level={level} 
              onUpdate={(v) => updateLevelName(idx, v)} 
              onRemove={() => levels.length > 1 && removeLevelConfirm(idx)}
            />
          ))}
        </div>
      </div>

      {/* Tree Node Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">
            Struktur Opsi Hierarki
            <span className="font-normal text-muted-foreground ml-1.5">({countNodes(tree)} node)</span>
          </p>
          <Button size="sm" variant="outline" className="gap-1 h-6 text-[10px]" onClick={addRootNode}>
            <Plus className="h-3 w-3" /> Opsi Root
          </Button>
        </div>

        {tree.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-2">
            Klik "Tambah Opsi Root" untuk mulai.
          </p>
        )}

        <div className="space-y-0.5">
          {tree.map((node, idx) => (
            <TreeNodeEditor
              key={idx}
              node={node}
              depth={0}
              maxDepth={levels.length}
              levelNames={levels}
              onUpdate={(updated) => updateRootNode(idx, updated)}
              onRemove={() => removeRootNode(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

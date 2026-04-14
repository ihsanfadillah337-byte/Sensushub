import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Layers, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { TreeNode } from "@/contexts/CustomColumnsContext";

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
  
  // Phase Create: Automatically edit if the label is empty
  const [editingNode, setEditingNode] = useState<boolean>(!node.label);
  
  const [editLabel, setEditLabel] = useState(node.label || "");
  const [editCode, setEditCode] = useState(node.code || "");

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

  const startEditing = () => {
    setEditLabel(node.label);
    setEditCode(node.code);
    setEditingNode(true);
  };

  const saveEdit = () => {
    onUpdate({ ...node, label: editLabel, code: editCode });
    setEditingNode(false);
  };

  const cancelEdit = () => {
    setEditLabel(node.label);
    setEditCode(node.code);
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

        {editingNode ? (
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <Input
              className="h-7 text-xs flex-1 min-w-0"
              placeholder={`Label ${levelNames[depth] || `Level ${depth + 1}`}`}
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              autoFocus
            />
            <Input
              className="h-7 text-xs w-16 font-mono shrink-0"
              placeholder="Kode"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary shrink-0" onClick={saveEdit}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            {node.label && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground shrink-0" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {node.code ? <span className="font-mono text-xs text-muted-foreground shrink-0">{node.code}</span> : null}
            <span className="text-sm truncate">{node.label || <span className="text-muted-foreground italic text-xs">Kosong</span>}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-primary transition-colors shrink-0"
              onClick={startEditing}
              title="Edit Node"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}

        {canAddChild && !editingNode && (
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

        {!editingNode && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            onClick={onRemove}
            title={hasChildren ? "Hapus Node beserta sub-cabangnya" : "Hapus Node"}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {(node.children || []).map((child, idx) => (
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
  // Phase Create: Automatically edit if the label is empty
  const [editing, setEditing] = useState(!level);
  const [val, setVal] = useState(level || "");

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
          {level && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground shrink-0" onClick={() => { setVal(level); setEditing(false); }}><X className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-between">
          <span className="text-xs">{level || <span className="text-muted-foreground italic">Level {idx + 1}</span>}</span>
          <div className="flex items-center gap-1">
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
  const addLevel = () => {
    onLevelsChange([...(levels || []), ""]);
  };

  const executeRemoveLevel = (idx: number) => {
    if ((levels || []).length <= 1) return;
    onLevelsChange((levels || []).filter((_, i) => i !== idx));

    const pruneDepth = (nodes: TreeNode[], maxDepth: number, currentDepth: number): TreeNode[] => {
      if (currentDepth >= maxDepth) return [];
      return (nodes || []).map((n) => ({
        ...n,
        children: n.children ? pruneDepth(n.children, maxDepth, currentDepth + 1) : undefined,
      }));
    };
    onTreeChange(pruneDepth(tree || [], idx, 0));
  };

  const updateLevelName = (idx: number, name: string) => {
    onLevelsChange((levels || []).map((l, i) => (i === idx ? name : l)));
  };

  const addRootNode = () => {
    onTreeChange([...(tree || []), { label: "", code: "" }]);
  };

  const updateRootNode = (idx: number, updated: TreeNode) => {
    const newTree = [...(tree || [])];
    newTree[idx] = updated;
    onTreeChange(newTree);
  };

  const removeRootNode = (idx: number) => {
    onTreeChange((tree || []).filter((_, i) => i !== idx));
  };

  const countNodes = (nodes: TreeNode[]): number => {
    if (!nodes || !Array.isArray(nodes)) return 0;
    let count = 0;
    for (const n of nodes) {
      if (!n) continue;
      count++;
      if (n.children && Array.isArray(n.children)) count += countNodes(n.children);
    }
    return count;
  };

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
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
          {(levels || []).map((level, idx) => (
            <LevelItem 
              key={idx} 
              idx={idx} 
              level={level} 
              onUpdate={(v) => updateLevelName(idx, v)} 
              onRemove={() => executeRemoveLevel(idx)}
            />
          ))}
        </div>
      </div>

      {/* Tree Node Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">
            Struktur Opsi Hierarki
            <span className="font-normal text-muted-foreground ml-1.5">({countNodes(tree || [])} node)</span>
          </p>
          <Button size="sm" variant="outline" className="gap-1 h-6 text-[10px]" onClick={addRootNode}>
            <Plus className="h-3 w-3" /> Opsi Root
          </Button>
        </div>

        {(!tree || tree.length === 0) && (
          <p className="text-[11px] text-muted-foreground py-2">
            Klik "Tambah Opsi Root" untuk mulai.
          </p>
        )}

        <div className="space-y-0.5">
          {(tree || []).map((node, idx) => (
            <TreeNodeEditor
              key={idx}
              node={node}
              depth={0}
              maxDepth={(levels || []).length}
              levelNames={levels || []}
              onUpdate={(updated) => updateRootNode(idx, updated)}
              onRemove={() => removeRootNode(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

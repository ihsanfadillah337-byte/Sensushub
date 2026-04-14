import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Layers } from "lucide-react";
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

        <Input
          className="h-7 text-xs flex-1 min-w-0"
          placeholder={`Label ${levelNames[depth] || `Level ${depth + 1}`}`}
          value={node.label}
          onChange={(e) => onUpdate({ ...node, label: e.target.value })}
        />
        <Input
          className="h-7 text-xs w-16 font-mono shrink-0"
          placeholder="Kode"
          value={node.code}
          onChange={(e) => onUpdate({ ...node, code: e.target.value })}
        />

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
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

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

/* ─── Main Tree Builder Component ─── */
interface TreeBuilderProps {
  levels: string[];
  tree: TreeNode[];
  onLevelsChange: (levels: string[]) => void;
  onTreeChange: (tree: TreeNode[]) => void;
}

export default function TreeBuilder({ levels, tree, onLevelsChange, onTreeChange }: TreeBuilderProps) {
  const addLevel = () => {
    onLevelsChange([...levels, ""]);
  };

  const removeLevel = (idx: number) => {
    if (levels.length <= 1) return;
    onLevelsChange(levels.filter((_, i) => i !== idx));
    // Also prune the tree to new max depth
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
    onTreeChange([...tree, { label: "", code: "" }]);
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
        <div className="space-y-1.5">
          {levels.map((level, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 tabular-nums">
                L{idx + 1}
              </Badge>
              <Input
                className="h-7 text-xs flex-1"
                placeholder={`Nama level ${idx + 1} (cth: Golongan)`}
                value={level}
                onChange={(e) => updateLevelName(idx, e.target.value)}
              />
              {levels.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeLevel(idx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
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
            <Plus className="h-3 w-3" /> Opsi {levels[0] || "Root"}
          </Button>
        </div>

        {tree.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-2">
            Klik "Tambah Opsi" untuk mulai membangun hierarki dropdown.
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

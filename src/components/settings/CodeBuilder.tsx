import { useState, useMemo } from "react";
import { Eye, EyeOff, GripVertical, Lock, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCustomColumns, type CodeBlock, type CodeConfiguration } from "@/contexts/CustomColumnsContext";
import { buildCodePreview, type CodeValueMap } from "@/lib/assetCode";

/* ─── Sortable Block Item ─── */
function SortableBlock({
  block, onToggleVisibility,
}: {
  block: CodeBlock;
  onToggleVisibility: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
    disabled: block.isFixed,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className="group">
      <div
        className={`flex items-center justify-between px-4 py-2.5 rounded-lg border transition-all ${
          block.isFixed
            ? "border-primary/20 bg-primary/5"
            : block.isVisible
            ? "border-border bg-card hover:border-primary/30"
            : "border-border/50 bg-muted/30 opacity-50"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {block.isFixed ? (
            <Lock className="h-3.5 w-3.5 text-primary/60" />
          ) : (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          <span className={`text-sm font-medium ${block.isVisible ? "text-foreground" : "text-muted-foreground line-through"}`}>
            {block.label}
          </span>

          {block.isFixed && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 leading-4 border-primary/30 text-primary">
              Terkunci
            </Badge>
          )}
        </div>

        {!block.isFixed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onToggleVisibility(block.id)}
            title={block.isVisible ? "Sembunyikan dari kode" : "Tampilkan di kode"}
          >
            {block.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </li>
  );
}

/* ─── Main Code Builder Component ─── */
export default function CodeBuilder() {
  const { codeConfig, setCodeConfig, masterDivisi, masterKib, kibColumns } = useCustomColumns();
  const [isExpanded, setIsExpanded] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build sample value map for preview
  const sampleMap = useMemo<CodeValueMap>(() => {
    const map: CodeValueMap = {};
    if (masterDivisi.length > 0) map.divisi = masterDivisi[0].code;
    if (masterKib.length > 0) map.kib = masterKib[0].code;
    // Add sample coded_dropdown values from all KIBs
    for (const cols of Object.values(kibColumns)) {
      for (const col of cols) {
        if (col.type === "coded_dropdown" && col.options && col.options.length > 0) {
          map[col.name] = col.options[0].code;
        }
      }
    }
    return map;
  }, [masterDivisi, masterKib, kibColumns]);

  // Get available custom coded columns from all KIBs
  const availableCustomBlocks = useMemo(() => {
    const seen = new Set<string>();
    const blocks: CodeBlock[] = [];
    for (const cols of Object.values(kibColumns)) {
      for (const col of cols) {
        if (col.type === "coded_dropdown" && !seen.has(col.name)) {
          seen.add(col.name);
          blocks.push({
            id: `col_${col.name}`,
            label: col.name,
            source: "custom_column",
            columnName: col.name,
            isVisible: true,
            isFixed: false,
          });
        }
      }
    }
    return blocks;
  }, [kibColumns]);

  // Sync config blocks with available blocks (add new, keep existing order/visibility)
  const syncedConfig = useMemo<CodeConfiguration>(() => {
    const currentIds = new Set(codeConfig.blocks.map((b) => b.id));
    const newBlocks: CodeBlock[] = [];

    // Add any new custom blocks that aren't in the config yet
    for (const ab of availableCustomBlocks) {
      if (!currentIds.has(ab.id)) {
        newBlocks.push(ab);
      }
    }

    if (newBlocks.length === 0) return codeConfig;

    // Insert new blocks before the serial (fixed) block
    const serialIdx = codeConfig.blocks.findIndex((b) => b.isFixed);
    const blocks = [...codeConfig.blocks];
    if (serialIdx >= 0) {
      blocks.splice(serialIdx, 0, ...newBlocks);
    } else {
      blocks.push(...newBlocks);
    }

    return { ...codeConfig, blocks };
  }, [codeConfig, availableCustomBlocks]);

  // Non-fixed blocks for DnD, plus fixed at end
  const draggableBlocks = syncedConfig.blocks.filter((b) => !b.isFixed);
  const fixedBlocks = syncedConfig.blocks.filter((b) => b.isFixed);
  const allBlocks = [...draggableBlocks, ...fixedBlocks];

  const livePreview = buildCodePreview(syncedConfig, sampleMap);

  const handleSeparatorChange = (sep: string) => {
    const updated = { ...syncedConfig, separator: sep as CodeConfiguration["separator"] };
    setCodeConfig(updated);
  };

  const handleToggleVisibility = (id: string) => {
    const updated = {
      ...syncedConfig,
      blocks: syncedConfig.blocks.map((b) =>
        b.id === id ? { ...b, isVisible: !b.isVisible } : b
      ),
    };
    setCodeConfig(updated);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const blocks = syncedConfig.blocks.filter((b) => !b.isFixed);
    const fixed = syncedConfig.blocks.filter((b) => b.isFixed);

    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(blocks, oldIndex, newIndex);
    setCodeConfig({ ...syncedConfig, blocks: [...reordered, ...fixed] });
  };

  const separatorLabel = { "-": "Strip ( - )", ".": "Titik ( . )", "/": "Slash ( / )" };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div
        className="flex items-center gap-2 px-5 py-4 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Hash className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Format Kode Aset</h2>
        <Badge variant="outline" className="ml-auto text-[10px] tabular-nums">
          WYSIWYG Builder
        </Badge>
      </div>

      {isExpanded && (
        <div className="p-5 space-y-5">
          {/* Live Preview */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
              Live Preview
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {syncedConfig.blocks
                .filter((b) => b.isVisible)
                .map((b) => {
                  const key = b.source === 'divisi' ? 'divisi' : b.source === 'kib' ? 'kib' : b.columnName || b.id;
                  const val = b.isFixed ? "001" : sampleMap[key] || "??";
                  return (
                    <div key={b.id} className="flex items-center gap-1">
                      <Badge
                        variant="secondary"
                        className={`text-xs font-mono px-2 py-0.5 ${
                          b.isFixed ? "bg-primary/15 text-primary border-primary/30" : ""
                        }`}
                      >
                        {val}
                      </Badge>
                    </div>
                  );
                })
                .reduce<React.ReactNode[]>((acc, el, i) => {
                  if (i > 0) {
                    acc.push(
                      <span key={`sep-${i}`} className="text-sm font-mono text-muted-foreground font-bold">
                        {syncedConfig.separator}
                      </span>
                    );
                  }
                  acc.push(el);
                  return acc;
                }, [])}
            </div>
            <p className="text-xs font-mono text-primary font-bold mt-2">{livePreview}</p>
          </div>

          {/* Separator Picker */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Karakter Pemisah</p>
            <Select value={syncedConfig.separator} onValueChange={handleSeparatorChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-">{separatorLabel["-"]}</SelectItem>
                <SelectItem value=".">{separatorLabel["."]}</SelectItem>
                <SelectItem value="/">{separatorLabel["/"]}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Drag-and-Drop Block List */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Blok Penyusun Kode{" "}
              <span className="text-muted-foreground/60">— geser untuk mengubah urutan, klik 👁 untuk sembunyikan</span>
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={draggableBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1.5">
                  {allBlocks.map((block) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      onToggleVisibility={handleToggleVisibility}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>

          {availableCustomBlocks.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              💡 Tambahkan kolom "Dropdown Berkode" di Pengaturan Kolom Custom untuk menambah blok kode baru.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

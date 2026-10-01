"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import ReactFlow, {
  Node, Edge,
  Background, BackgroundVariant,
  useNodesState, useEdgesState,
  MarkerType, Panel,
  useReactFlow, ReactFlowProvider,
  Handle, Position,
} from "reactflow";
import dagre from "@dagrejs/dagre";
import "reactflow/dist/style.css";
import {
  ZoomIn, ZoomOut, Maximize2, AlertTriangle, Database,
  FileJson, Image as ImageIcon, X, LayoutGrid,
  GitFork, Table2, Share2, Layers, GitBranch,
  type LucideIcon,
} from "lucide-react";
import { parseSQLSchema, validateSQL, type Table } from "@/lib/sqlParser";
import { cn } from "@/lib/utils";
import html2canvas from "html2canvas";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────
export type DiagramType = "er" | "flowchart" | "dfd0" | "dfd1" | "class";

// ── Diagram config ────────────────────────────────────────────────────────────
const DIAGRAM_CONFIG: Record<DiagramType, {
  label: string; icon: LucideIcon;
  color: string; darkColor: string; description: string;
}> = {
  er:        { label: "ER Diagram",    icon: Table2,    color: "#2563EB", darkColor: "#8BAA82", description: "Entity-relationship diagram with tables & foreign keys" },
  flowchart: { label: "Flowchart",     icon: GitFork,   color: "#059669", darkColor: "#5BAF8A", description: "Schema creation process flow" },
  dfd0:      { label: "DFD Level 0",   icon: Share2,    color: "#D97706", darkColor: "#C89B5E", description: "Context diagram — system vs external entities" },
  dfd1:      { label: "DFD Level 1",   icon: Layers,    color: "#7C3AED", darkColor: "#A78BFA", description: "Decomposed processes, data stores & flows" },
  class:     { label: "Class Diagram", icon: GitBranch, color: "#0284C7", darkColor: "#38BDF8", description: "OOP classes with attributes & relationships" },
};

// ── Node sizing ───────────────────────────────────────────────────────────────
const HEADER_H = 40, ROW_H = 30, MIN_W = 240, NODE_PAD = 12;
const tableH = (n: number) => HEADER_H + n * ROW_H + NODE_PAD;

// ── Dagre layout ──────────────────────────────────────────────────────────────
function layout(nodes: Node[], edges: Edge[], dir: "TB" | "LR" = "TB"): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 80, ranksep: 110 });
  nodes.forEach((n) => {
    const t = n.type ?? "";
    let w = MIN_W + 40, h = 80;
    if      (t === "erTable" || t === "classNode") { const c = (n.data as any)?.columns?.length ?? 4; h = tableH(c); }
    else if (t === "dfdNode")  { const k = (n.data as any)?.kind ?? "process"; w = k === "process" ? 140 : 170; h = k === "process" ? 140 : 60; }
    else if (t === "flowNode") { w = 220; h = 60; }
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

function ERTableNode({ data }: { data: any }) {
  const { table, isDark, accentColor } = data as { table: Table; isDark: boolean; accentColor: string };
  return (
    <div style={{ minWidth: MIN_W }} className={cn("rounded-xl border-2 shadow-xl overflow-hidden", isDark ? "bg-[#221C1D] border-[rgba(255,255,255,0.10)]" : "bg-white border-gray-200")}>
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, top: -4 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: -4 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, left: -4 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, right: -4 }} />
      <div className="flex items-center gap-2 px-3 text-white text-[13px] font-bold" style={{ height: HEADER_H, background: accentColor }}>
        <Database size={14} className="flex-shrink-0" />
        <span className="truncate flex-1">{table.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20">{table.columns.length}</span>
      </div>
      {table.columns.map((col, i) => (
        <div key={i} className={cn("flex items-center gap-2 px-3 text-[11px] border-t", isDark ? "border-[rgba(255,255,255,0.05)]" : "border-gray-100")} style={{ height: ROW_H }}>
          <div className="w-[38px] flex-shrink-0">
            {col.isPrimaryKey && col.isForeignKey  && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700">PK/FK</span>}
            {col.isPrimaryKey && !col.isForeignKey && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">PK</span>}
            {col.isForeignKey && !col.isPrimaryKey && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700">FK</span>}
          </div>
          <span className={cn("flex-1 font-medium truncate", col.isPrimaryKey ? "text-amber-600" : isDark ? "text-[var(--text)]" : "text-gray-800")}>{col.name}</span>
          <span className={cn("font-mono text-[10px] flex-shrink-0", isDark ? "text-[var(--text-subtle)]" : "text-gray-400")}>{col.type}</span>
        </div>
      ))}
    </div>
  );
}

function FlowNode({ data }: { data: any }) {
  const { label, shape, isDark, accentColor } = data;
  const isStart = shape === "start", isEnd = shape === "end", isDiamond = shape === "diamond";
  return (
    <div
      style={{ minWidth: 180, background: isStart ? "#10B981" : isEnd ? "#EF4444" : accentColor }}
      className={cn("flex items-center justify-center px-5 py-3 text-[12px] font-semibold text-white shadow-lg", isStart || isEnd ? "rounded-full" : isDiamond ? "rounded-lg rotate-0" : "rounded-xl")}
    >
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, top: -4 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: -4 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, left: -4 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, right: -4 }} />
      {isDiamond ? (
        <div className="flex flex-col items-center gap-0.5">
          <span style={{ fontSize: 10, opacity: 0.7 }}>◆</span>
          <span className="text-center text-[11px]">{label}</span>
        </div>
      ) : (
        <span className="text-center whitespace-pre-wrap">{label}</span>
      )}
    </div>
  );
}

function DFDNode({ data }: { data: any }) {
  const { label, kind, isDark, accentColor } = data;
  if (kind === "external") return (
    <div style={{ minWidth: 140 }} className={cn("flex items-center justify-center px-4 py-3 text-[12px] font-bold border-2 shadow-md", isDark ? "bg-[#221C1D] text-[var(--text)] border-[rgba(255,255,255,0.25)]" : "bg-white text-gray-800 border-gray-500")}>
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, right: -4 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, left: -4 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: -4 }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, top: -4 }} />
      {label}
    </div>
  );
  if (kind === "datastore") return (
    <div style={{ minWidth: 160, borderColor: accentColor }} className={cn("flex items-center gap-2 px-4 py-3 text-[12px] font-semibold border-t-2 border-b-2 shadow-md", isDark ? "bg-[#221C1D] text-[var(--text)]" : "bg-gray-50 text-gray-800")}>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, right: -4 }} />
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, left: -4 }} />
      <Handle type="source" position={Position.Top}   style={{ opacity: 0, top: -4 }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, bottom: -4 }} />
      <span className="text-[10px] font-bold opacity-50 mr-1">D</span>{label}
    </div>
  );
  return (
    <div style={{ width: 130, height: 130, borderRadius: "50%", background: accentColor }} className="flex items-center justify-center text-white text-[11px] font-bold text-center shadow-xl px-3">
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: -4 }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, top: -4 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, right: -4 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, left: -4 }} />
      <span className="whitespace-pre-wrap text-center">{label}</span>
    </div>
  );
}

function ClassNode({ data }: { data: any }) {
  const { name, attributes, methods, isDark, accentColor } = data;
  return (
    <div style={{ minWidth: 210 }} className={cn("rounded-xl border-2 shadow-xl overflow-hidden", isDark ? "bg-[#221C1D] border-[rgba(255,255,255,0.10)]" : "bg-white border-gray-200")}>
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, top: -4 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: -4 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, left: -4 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, right: -4 }} />
      <div className="flex items-center justify-center px-3 py-3 text-white text-[13px] font-bold" style={{ background: accentColor }}>
        {"«class»"}<br />{name}
      </div>
      <div className={cn("border-t px-3 py-1.5", isDark ? "border-[rgba(255,255,255,0.08)]" : "border-gray-100")}>
        {attributes.map((a: string, i: number) => (
          <p key={i} className={cn("text-[11px] font-mono py-0.5", isDark ? "text-[var(--text-muted)]" : "text-gray-600")}>
            <span className="text-blue-400 mr-1">─</span>{a}
          </p>
        ))}
      </div>
      <div className={cn("border-t px-3 py-1.5", isDark ? "border-[rgba(255,255,255,0.08)]" : "border-gray-100")}>
        {methods.map((m: string, i: number) => (
          <p key={i} className={cn("text-[11px] font-mono py-0.5", isDark ? "text-[var(--text-muted)]" : "text-gray-600")}>
            <span className="text-emerald-400 mr-1">+</span>{m}
          </p>
        ))}
      </div>
    </div>
  );
}

// module-level so ReactFlow never sees a "new" nodeTypes object
const NODE_TYPES = { erTable: ERTableNode, flowNode: FlowNode, dfdNode: DFDNode, classNode: ClassNode };

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS — each returns { nodes, edges } for its diagram type
// ─────────────────────────────────────────────────────────────────────────────

function buildER(sql: string, isDark: boolean, accent: string) {
  const p = parseSQLSchema(sql);
  const ns: Node[] = p.tables.map((t) => ({
    id: t.name, type: "erTable", position: { x: 0, y: 0 },
    data: { table: t, isDark, accentColor: accent, columns: t.columns }, draggable: true,
  }));
  const es: Edge[] = p.relationships.map((r) => ({
    id: r.id, source: r.fromTable, target: r.toTable, type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: accent, width: 18, height: 18 },
    style: { stroke: accent, strokeWidth: 2 },
    label: r.cardinality,
    labelStyle: { fontSize: 10, fontWeight: 700, fill: isDark ? "#F7F3E8" : "#1E1B18" },
    labelBgStyle: { fill: isDark ? "#221C1D" : "#fff", fillOpacity: 0.9 },
    labelBgPadding: [4, 6] as [number, number], labelBgBorderRadius: 4,
  }));
  return { nodes: layout(ns, es, "TB"), edges: es };
}

function buildFlowchart(sql: string, isDark: boolean, accent: string) {
  const p = parseSQLSchema(sql);
  const names = p.tables.map((t) => t.name);
  if (!names.length) return { nodes: [] as Node[], edges: [] as Edge[] };
  const ns: Node[] = [], es: Edge[] = [];
  const mk = (id: string, label: string, shape: string) =>
    ({ id, type: "flowNode", position: { x: 0, y: 0 }, data: { label, shape, isDark, accentColor: accent }, draggable: true } as Node);
  const me = (id: string, src: string, tgt: string, label?: string) =>
    ({ id, source: src, target: tgt, type: "smoothstep", animated: true,
       markerEnd: { type: MarkerType.ArrowClosed, color: accent }, style: { stroke: accent, strokeWidth: 2 }, label } as Edge);
  ns.push(mk("__start__", "START", "start"));
  ns.push(mk("__dec__", "Create Schema?", "diamond"));
  es.push(me("e0", "__start__", "__dec__", "YES"));
  names.forEach((name, i) => {
    ns.push(mk(`tbl_${name}`, `CREATE TABLE\n${name}`, "process"));
    es.push(me(`e${i + 1}`, i === 0 ? "__dec__" : `tbl_${names[i - 1]}`, `tbl_${name}`));
  });
  const last = `tbl_${names[names.length - 1]}`;
  if (p.relationships.length > 0) {
    ns.push(mk("__fk__", `ADD ${p.relationships.length} FK Constraint${p.relationships.length > 1 ? "s" : ""}`, "process"));
    es.push(me("e_fk", last, "__fk__"));
    ns.push(mk("__end__", "END", "end"));
    es.push(me("e_end", "__fk__", "__end__"));
  } else {
    ns.push(mk("__end__", "END", "end"));
    es.push(me("e_end", last, "__end__"));
  }
  return { nodes: layout(ns, es, "TB"), edges: es };
}

function buildDFD0(sql: string, isDark: boolean, accent: string) {
  const p = parseSQLSchema(sql);
  if (!p.tables.length) return { nodes: [] as Node[], edges: [] as Edge[] };
  const ns: Node[] = [], es: Edge[] = [];
  ns.push({ id: "__sys__", type: "dfdNode", position: { x: 0, y: 0 }, data: { label: "Database\nSystem", kind: "process", isDark, accentColor: accent }, draggable: true });
  p.tables.forEach((t, i) => {
    const eid = `ext_${t.name}`;
    ns.push({ id: eid, type: "dfdNode", position: { x: 0, y: 0 }, data: { label: t.name, kind: "external", isDark, accentColor: accent }, draggable: true });
    es.push({ id: `in_${i}`,  source: eid,    target: "__sys__", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: accent }, style: { stroke: accent, strokeWidth: 2 }, label: "data in",  labelStyle: { fontSize: 9, fill: isDark ? "#F7F3E8" : "#374151" } });
    es.push({ id: `out_${i}`, source: "__sys__", target: eid,  type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: accent }, style: { stroke: accent, strokeWidth: 1.5, strokeDasharray: "5 3" }, label: "data out", labelStyle: { fontSize: 9, fill: isDark ? "#F7F3E8" : "#374151" } });
  });
  return { nodes: layout(ns, es, "LR"), edges: es };
}

function buildDFD1(sql: string, isDark: boolean, accent: string) {
  const p = parseSQLSchema(sql);
  if (!p.tables.length) return { nodes: [] as Node[], edges: [] as Edge[] };
  const ns: Node[] = [], es: Edge[] = [];
  p.tables.forEach((t, i) => {
    ns.push({ id: `proc_${t.name}`, type: "dfdNode", position: { x: 0, y: 0 }, data: { label: `P${i + 1}\n${t.name}`, kind: "process", isDark, accentColor: accent }, draggable: true });
    ns.push({ id: `ds_${t.name}`,   type: "dfdNode", position: { x: 0, y: 0 }, data: { label: t.name, kind: "datastore", isDark, accentColor: accent }, draggable: true });
    es.push({ id: `store_${i}`, source: `proc_${t.name}`, target: `ds_${t.name}`, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: accent }, style: { stroke: accent, strokeWidth: 2 }, label: "write" });
  });
  p.relationships.forEach((r, i) => {
    const src = `proc_${r.fromTable}`, tgt = `proc_${r.toTable}`;
    if (ns.find((n) => n.id === src) && ns.find((n) => n.id === tgt))
      es.push({ id: `fk_${i}`, source: src, target: tgt, type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: accent }, style: { stroke: accent, strokeWidth: 1.5 }, label: `${r.fromColumn}→${r.toColumn}`, labelStyle: { fontSize: 9, fill: isDark ? "#F7F3E8" : "#374151" } });
  });
  return { nodes: layout(ns, es, "LR"), edges: es };
}

function buildClass(sql: string, isDark: boolean, accent: string) {
  const p = parseSQLSchema(sql);
  if (!p.tables.length) return { nodes: [] as Node[], edges: [] as Edge[] };
  const ns: Node[] = p.tables.map((t) => ({
    id: t.name, type: "classNode", position: { x: 0, y: 0 }, draggable: true,
    data: {
      name: t.name,
      attributes: t.columns.map((c) => `${c.isPrimaryKey ? "# " : c.isForeignKey ? "~ " : "+ "}${c.name}: ${c.type}`),
      methods: ["+ findById(id)", "+ save()", "+ delete()"],
      isDark, accentColor: accent, columns: t.columns,
    },
  }));
  const es: Edge[] = p.relationships.map((r) => ({
    id: r.id, source: r.fromTable, target: r.toTable, type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: accent, width: 20, height: 20 },
    style: { stroke: accent, strokeWidth: 2 }, label: "1..* — 1",
    labelStyle: { fontSize: 10, fontWeight: 600, fill: isDark ? "#F7F3E8" : "#1E1B18" },
    labelBgStyle: { fill: isDark ? "#221C1D" : "#fff", fillOpacity: 0.9 },
    labelBgPadding: [4, 6] as [number, number], labelBgBorderRadius: 4,
  }));
  return { nodes: layout(ns, es, "TB"), edges: es };
}

function buildDiagram(type: DiagramType, sql: string, isDark: boolean) {
  const cfg = DIAGRAM_CONFIG[type];
  const accent = isDark ? cfg.darkColor : cfg.color;
  const validation = validateSQL(sql);
  if (!validation.valid) return { nodes: [] as Node[], edges: [] as Edge[], error: validation.error || "Invalid SQL" };
  try {
    let r: { nodes: Node[]; edges: Edge[] };
    switch (type) {
      case "er":        r = buildER(sql, isDark, accent);         break;
      case "flowchart": r = buildFlowchart(sql, isDark, accent);  break;
      case "dfd0":      r = buildDFD0(sql, isDark, accent);       break;
      case "dfd1":      r = buildDFD1(sql, isDark, accent);       break;
      case "class":     r = buildClass(sql, isDark, accent);      break;
      default:          r = buildER(sql, isDark, accent);
    }
    if (!r.nodes.length) return { nodes: [], edges: [], error: "No nodes generated from your SQL." };
    return { ...r, error: null as null };
  } catch (e) {
    return { nodes: [] as Node[], edges: [] as Edge[], error: e instanceof Error ? e.message : "Build failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS — receives a fixed `diagramType` prop; keyed externally so it fully
// remounts (fresh ReactFlow state) whenever the tab changes.
// ─────────────────────────────────────────────────────────────────────────────
function DiagramCanvas({ sql, diagramType, isDark, onClose }: {
  sql: string; diagramType: DiagramType; isDark: boolean; onClose: () => void;
}) {
  const result     = buildDiagram(diagramType, sql, isDark);
  const accent     = isDark ? DIAGRAM_CONFIG[diagramType].darkColor : DIAGRAM_CONFIG[diagramType].color;

  const [nodes, , onNodesChange] = useNodesState(result.error ? [] : result.nodes);
  const [edges, , onEdgesChange] = useEdgesState(result.error ? [] : result.edges);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fit after mount
  useEffect(() => {
    if (!result.error) setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 60);
  }, []);

  const handleExportPNG = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      const c = await html2canvas(containerRef.current, { backgroundColor: isDark ? "#1C1718" : "#ffffff", scale: 2 });
      const a = document.createElement("a"); a.download = `${diagramType}-diagram.png`; a.href = c.toDataURL("image/png"); a.click();
    } catch { /* silent */ }
  }, [isDark, diagramType]);

  const handleExportJSON = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(parseSQLSchema(sql), null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.download = "schema.json"; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href);
    } catch { /* silent */ }
  }, [sql]);

  if (result.error) return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className={cn("text-base font-bold", isDark ? "text-[var(--text)]" : "text-gray-900")}>Could not generate diagram</h3>
        <p className={cn("text-sm", isDark ? "text-[var(--text-muted)]" : "text-gray-500")}>{result.error}</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 relative" ref={containerRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.05}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        attributionPosition="bottom-left"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color={isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"} />

        <Panel position="top-right">
          <div className={cn("flex flex-col gap-1 p-1.5 rounded-xl border shadow-md", isDark ? "bg-[#221C1D] border-[rgba(255,255,255,0.08)]" : "bg-white border-gray-200")}>
            {[
              { fn: () => zoomIn({ duration: 300 }),              Icon: ZoomIn,    title: "Zoom in" },
              { fn: () => zoomOut({ duration: 300 }),             Icon: ZoomOut,   title: "Zoom out" },
              { fn: () => fitView({ padding: 0.18, duration: 500 }), Icon: Maximize2, title: "Fit view" },
            ].map(({ fn, Icon, title }) => (
              <button key={title} onClick={fn} title={title} className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors", isDark ? "text-[var(--text-muted)] hover:bg-[var(--surface)]" : "text-gray-500 hover:bg-gray-100")}>
                <Icon size={14} />
              </button>
            ))}
            <div className={cn("h-px mx-1", isDark ? "bg-[rgba(255,255,255,0.08)]" : "bg-gray-100")} />
            <button onClick={handleExportPNG}  title="Export PNG"  className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors", isDark ? "text-[var(--text-muted)] hover:bg-[var(--surface)]" : "text-gray-500 hover:bg-gray-100")}><ImageIcon size={14} /></button>
            <button onClick={handleExportJSON} title="Export JSON" className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors", isDark ? "text-[var(--text-muted)] hover:bg-[var(--surface)]" : "text-gray-500 hover:bg-gray-100")}><FileJson size={14} /></button>
          </div>
        </Panel>

        {diagramType === "er" && (
          <Panel position="bottom-left">
            <div className={cn("flex items-center gap-3 px-3 py-2 rounded-xl border text-[10px] font-medium", isDark ? "bg-[#221C1D] border-[rgba(255,255,255,0.08)] text-[var(--text-muted)]" : "bg-white border-gray-200 text-gray-500 shadow-sm")}>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" />PK</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400"  />FK</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-400"/>PK/FK</span>
              <span className="flex items-center gap-1.5"><span className="w-8 h-0.5" style={{ background: accent }} />1:N</span>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SHELL — owns activeType state; keys ReactFlowProvider+DiagramCanvas
// so the entire React + ReactFlow tree remounts on every tab switch.
// ─────────────────────────────────────────────────────────────────────────────
function ModalShell({ sql, theme, onClose, initialTab = "er" }: { sql: string; theme: "light" | "dark"; onClose: () => void; initialTab?: DiagramType }) {
  const isDark = theme === "dark";
  const [activeType, setActiveType] = useState<DiagramType>(initialTab);
  const cfg    = DIAGRAM_CONFIG[activeType];
  const accent = isDark ? cfg.darkColor : cfg.color;
  const Icon   = cfg.icon;

  return (
    <div className={cn("flex flex-col h-full", isDark ? "bg-[#1C1718]" : "bg-gray-50")}>

      {/* Header */}
      <div className={cn("flex items-center justify-between px-4 py-3 border-b flex-shrink-0", isDark ? "border-[rgba(255,255,255,0.08)] bg-[#221C1D]" : "border-gray-200 bg-white")}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent }}>
            <Icon size={17} className="text-white" />
          </div>
          <div>
            <h2 className={cn("text-[15px] font-bold leading-tight", isDark ? "text-[var(--text)]" : "text-gray-900")}>{cfg.label}</h2>
            <p  className={cn("text-[11px] leading-tight",           isDark ? "text-[var(--text-muted)]" : "text-gray-500")}>{cfg.description}</p>
          </div>
        </div>
        <button onClick={onClose} title="Close" className={cn("p-2 rounded-lg transition-colors", isDark ? "text-[var(--text-muted)] hover:bg-[var(--surface)]" : "text-gray-500 hover:bg-gray-100")}>
          <X size={16} />
        </button>
      </div>

      {/* Tabs removed — diagram type selected from toolbar dropdown */}

      {/* Canvas — key forces full remount on tab switch */}
      <ReactFlowProvider key={activeType}>
        <DiagramCanvas
          key={activeType}
          sql={sql}
          diagramType={activeType}
          isDark={isDark}
          onClose={onClose}
        />
      </ReactFlowProvider>
    </div>
  );
}

export function InlineDiagramViewer({
  sql,
  diagramType = "er",
  theme = "light",
  minHeight = 440,
}: {
  sql: string;
  diagramType?: DiagramType;
  theme?: "light" | "dark";
  minHeight?: number;
}) {
  const isDark = theme === "dark";
  return (
    <div
      className={cn(
        "w-full rounded-xl border overflow-hidden relative flex flex-col",
        isDark ? "border-[rgba(255,255,255,0.08)] bg-[#1C1718]" : "border-gray-200 bg-white"
      )}
      style={{ height: minHeight }}
    >
      <ReactFlowProvider key={`${diagramType}-${theme}-${sql.length}`}>
        <DiagramCanvas
          sql={sql}
          diagramType={diagramType}
          isDark={isDark}
          onClose={() => {}}
        />
      </ReactFlowProvider>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────
export default function ERDiagramModal({ sql, isOpen, onClose, theme, initialTab = "er" }: {
  sql: string; isOpen: boolean; onClose: () => void; theme: "light" | "dark"; initialTab?: DiagramType;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className={cn("fixed inset-2 sm:inset-6 md:inset-8 z-50 rounded-2xl overflow-hidden flex flex-col shadow-2xl", theme === "dark" ? "bg-[#1C1718]" : "bg-white")}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalShell sql={sql} theme={theme} onClose={onClose} initialTab={initialTab} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MindDoc, Point } from "../../src/core/types";
import { bracketPath, defaultControls, edgePath, rectContains, rectDistance, relationshipGeom, taperPath } from "../../src/core/layout/geometry";
import type { NodeBox, Rect } from "../../src/core/layout";
import { countDescendants, indexDoc, isInSubtree } from "../../src/core/query";
import { cleanStyle } from "../../src/core/doc";
import { SELECTION_COLOR, withAlpha } from "../../src/core/theme";
import type { Scene } from "./scene";
import { TopicNode } from "./TopicNode";

export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export type DropTarget =
  | { type: "child"; parentId: string }
  | { type: "sibling"; parentId: string; index: number; line: [Point, Point] }
  | { type: "float"; pos: Point };

export interface CanvasApi {
  select(ids: string[], mode?: "replace" | "toggle" | "add"): void;
  startEdit(id: string): void;
  toggleFold(id: string): void;
  openLink(id: string): void;
  openNote(id: string): void;
  drop(ids: string[], target: DropTarget): void;
  addFloating(pos: Point): void;
  createRelationship(from: string, to: string): void;
  setControls(relId: string, controls: [Point, Point], commit: boolean): void;
  cancelLinking(): void;
  focusCapture(): void;
}

interface Props {
  doc: MindDoc;
  scene: Scene;
  selection: string[];
  linkingFrom: string | null;
  readOnly: boolean;
  viewport: Viewport;
  setViewport: (v: Viewport | ((v: Viewport) => Viewport)) => void;
  onSize: (w: number, h: number) => void;
  spaceHeld: React.MutableRefObject<{ down: boolean; used: boolean }>;
  api: CanvasApi;
}

type Drag =
  | { mode: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { mode: "marquee"; x0: number; y0: number; x1: number; y1: number; base: string[] }
  | { mode: "node"; ids: string[]; sx: number; sy: number; dx: number; dy: number; moved: boolean; drop: DropTarget | null; grab: Point; clickId: string; plain: boolean }
  | { mode: "handle"; relId: string; which: 0 | 1; controls: [Point, Point] };

export function Canvas({ doc, scene, selection, linkingFrom, readOnly, viewport, setViewport, onSize, spaceHeld, api }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const vpRef = useRef(viewport);
  vpRef.current = viewport;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const docRef = useRef(doc);
  docRef.current = doc;

  const L = scene.layout;
  const P = scene.palette;
  const sel = useMemo(() => new Set(selection), [selection]);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => onSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    onSize(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [onSize]);

  // 滚轮:Ctrl/⌘ 或触控板捏合缩放,其余平移
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002));
        setViewport((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setViewport((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setViewport]);

  // 触屏双指缩放:记录所有按下的触点,两指时取消当前拖动,按两指距离变化缩放
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ d0: number; v0: Viewport; mid: Point } | null>(null);
  useEffect(() => {
    const el = wrapRef.current!;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        const rect = el.getBoundingClientRect();
        pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v0: vpRef.current, mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top } };
        setD(null);
      }
    };
    const move = (e: PointerEvent) => {
      if (!touches.current.has(e.pointerId)) return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      if (!p || touches.current.size < 2) return;
      const [a, b] = [...touches.current.values()];
      const rect = el.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const z = zoomAt(p.v0, Math.hypot(a.x - b.x, a.y - b.y) / p.d0, p.mid.x, p.mid.y);
      setViewport({ ...z, x: z.x + mid.x - p.mid.x, y: z.y + mid.y - p.mid.y });
    };
    const up = (e: PointerEvent) => {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    };
    el.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [setViewport]);

  const toWorld = (cx: number, cy: number): Point => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (cx - rect.left - v.x) / v.k, y: (cy - rect.top - v.y) / v.k };
  };

  const setD = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  /** 拖动节点时的放置目标 */
  const computeDrop = (ids: string[], p: Point, grab: Point): DropTarget | null => {
    const s = sceneRef.current;
    const d = docRef.current;
    const idx = indexDoc(d);
    let best: { box: NodeBox; dist: number } | null = null;
    for (const box of s.layout.nodes.values()) {
      if (box.kind !== "topic") continue;
      if (ids.some((id) => isInSubtree(d, id, box.id))) continue;
      const dist = rectDistance(box, p);
      if (dist === 0) return { type: "child", parentId: box.id };
      if (!best || dist < best.dist) best = { box, dist };
    }
    if (best && best.dist < 48) {
      const e = idx.get(best.box.id)!;
      if (!e.parent) return { type: "child", parentId: best.box.id };
      const parentBox = s.layout.nodes.get(e.parent.id);
      const vertical = parentBox?.orient === "v";
      const b = best.box;
      const after = vertical ? p.x > b.x + b.w / 2 : p.y > b.y + b.h / 2;
      const line: [Point, Point] = vertical
        ? [
            { x: after ? b.x + b.w + 8 : b.x - 8, y: b.y - 4 },
            { x: after ? b.x + b.w + 8 : b.x - 8, y: b.y + b.h + 4 },
          ]
        : [
            { x: b.x, y: after ? b.y + b.h + 5 : b.y - 5 },
            { x: b.x + b.w, y: after ? b.y + b.h + 5 : b.y - 5 },
          ];
      return { type: "sibling", parentId: e.parent.id, index: e.index + (after ? 1 : 0), line };
    }
    if (ids.length === 1 && ids[0] !== d.root.id) return { type: "float", pos: { x: p.x - grab.x, y: p.y - grab.y } };
    return null;
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || pinch.current) return;
      if (d.mode === "pan") {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
        if (spaceHeld.current.down) spaceHeld.current.used = true;
        setViewport((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
      } else if (d.mode === "marquee") {
        const p = toWorld(e.clientX, e.clientY);
        const nd = { ...d, x1: p.x, y1: p.y };
        setD(nd);
        const r = normRect(nd.x0, nd.y0, nd.x1, nd.y1);
        const hits = [...sceneRef.current.layout.nodes.values()].filter((b) => b.kind === "topic" && intersects(r, b)).map((b) => b.id);
        api.select([...new Set([...d.base, ...hits])]);
      } else if (d.mode === "node") {
        const v = vpRef.current;
        const dx = (e.clientX - d.sx) / v.k;
        const dy = (e.clientY - d.sy) / v.k;
        const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4;
        const p = toWorld(e.clientX, e.clientY);
        setD({ ...d, dx, dy, moved, drop: moved ? computeDrop(d.ids, p, d.grab) : null });
      } else if (d.mode === "handle") {
        const rel = docRef.current.relationships?.find((r) => r.id === d.relId);
        if (!rel) return;
        const box = sceneRef.current.layout.nodes.get(d.which === 0 ? rel.from : rel.to);
        if (!box) return;
        const p = toWorld(e.clientX, e.clientY);
        const c: [Point, Point] = [...d.controls] as [Point, Point];
        c[d.which] = { x: Math.round(p.x - (box.x + box.w / 2)), y: Math.round(p.y - (box.y + box.h / 2)) };
        setD({ ...d, controls: c });
        api.setControls(d.relId, c, false);
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      setD(null);
      if (!d) return;
      if (d.mode === "pan" && !d.moved && !spaceHeld.current.down) {
        api.select([]);
        api.cancelLinking();
      } else if (d.mode === "node") {
        if (d.moved && d.drop && !readOnly) api.drop(d.ids, d.drop);
        else if (!d.moved && d.plain) api.select([d.clickId]);
      } else if (d.mode === "handle") {
        api.setControls(d.relId, d.controls, true);
      }
      api.focusCapture();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // drag 由 null 变非 null 时挂一次监听,过程中通过 ref 读取最新状态
  }, [drag === null]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (pinch.current) return;
    const target = (e.target as Element).closest("[data-kind]") as HTMLElement | null;
    const kind = target?.dataset.kind;
    const id = target?.dataset.id ?? target?.closest("[data-id]")?.getAttribute("data-id") ?? "";
    const v = vpRef.current;
    if (e.button === 1 || spaceHeld.current.down || !kind) {
      if (e.shiftKey && e.button === 0 && !spaceHeld.current.down) {
        const p = toWorld(e.clientX, e.clientY);
        setD({ mode: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: selection });
      } else {
        setD({ mode: "pan", sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false });
      }
      return;
    }
    e.preventDefault();
    switch (kind) {
      case "fold":
        api.toggleFold(id);
        return;
      case "link-icon":
        api.openLink(id);
        return;
      case "note-icon":
        api.openNote(id);
        return;
      case "handle": {
        const relId = target!.dataset.rel!;
        const which = Number(target!.dataset.which) as 0 | 1;
        const rel = doc.relationships?.find((r) => r.id === relId);
        if (!rel) return;
        const a = L.nodes.get(rel.from);
        const b = L.nodes.get(rel.to);
        if (!a || !b) return;
        setD({ mode: "handle", relId, which, controls: rel.controls ?? defaultControls(a, b) });
        return;
      }
      case "rel":
      case "boundary":
        api.select([id]);
        api.focusCapture();
        return;
      case "summary":
        api.select([id]);
        api.focusCapture();
        return;
      case "topic": {
        if (linkingFrom) {
          if (id !== linkingFrom) api.createRelationship(linkingFrom, id);
          api.cancelLinking();
          return;
        }
        const multi = e.metaKey || e.ctrlKey;
        if (multi) api.select([id], "toggle");
        else if (e.shiftKey) api.select([id], "add");
        else if (!sel.has(id)) api.select([id]);
        const ids = multi || e.shiftKey ? [...new Set([...selection, id])] : sel.has(id) ? selection.filter((x) => scene.topics.has(x)) : [id];
        const box = L.nodes.get(id)!;
        const p = toWorld(e.clientX, e.clientY);
        if (readOnly || (ids.length === 1 && ids[0] === doc.root.id)) {
          api.focusCapture();
          return;
        }
        setD({
          mode: "node",
          ids: ids.filter((x) => x !== doc.root.id),
          sx: e.clientX,
          sy: e.clientY,
          dx: 0,
          dy: 0,
          moved: false,
          drop: null,
          grab: { x: p.x - box.x, y: p.y - box.y },
          clickId: id,
          plain: !multi && !e.shiftKey && sel.has(id) && selection.length > 1,
        });
        return;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = (e.target as Element).closest("[data-kind]") as HTMLElement | null;
    const kind = target?.dataset.kind;
    const id = target?.dataset.id ?? "";
    if (!kind) {
      api.addFloating(toWorld(e.clientX, e.clientY));
      return;
    }
    if (kind === "topic" || kind === "summary" || kind === "rel" || kind === "boundary") api.startEdit(id);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (linkingFrom) setPointer(toWorld(e.clientX, e.clientY));
  };

  // ---------- 渲染 ----------

  const nodeDrag = drag?.mode === "node" && drag.moved ? drag : null;
  const dragging = useMemo(() => {
    if (!nodeDrag) return new Set<string>();
    const s = new Set<string>();
    for (const id of nodeDrag.ids) for (const b of L.nodes.values()) if (isInSubtree(doc, id, b.id)) s.add(b.id);
    return s;
  }, [nodeDrag?.ids, L, doc]);

  const edges = L.edges.map((e) => {
    const ps = scene.styles.get(e.from)!;
    const cs = scene.styles.get(e.to)!;
    // 中心主题连出的线用各分支自己的颜色
    const color = ps.kind === "root" ? cs.branchColor : ps.lineColor;
    const dim = dragging.has(e.to);
    if (e.fromRoot && ps.lineStyle === "curve") {
      return <path key={e.to} d={taperPath(e, ps.lineWidth * 2.2, Math.max(1.5, ps.lineWidth * 0.6))} fill={color} opacity={dim ? 0.3 : 1} />;
    }
    // 组织结构图里曲线会在父节点处挤成一束,改用圆角折线
    const style = e.orient === "v" && ps.lineStyle === "curve" ? "elbow" : ps.lineStyle;
    // 父节点有填充色块或是下划线样式时,起点缩进去被盖住,线从边缘自然散出
    const pb = L.nodes.get(e.from);
    const hides = ps.fill !== "none" || ps.shape === "underline";
    const inset = e.orient === "h" && hides && pb ? Math.min(24, pb.w * 0.3) : 0;
    return <path key={e.to} d={edgePath(e, style, inset)} fill="none" stroke={color} strokeWidth={ps.lineWidth} strokeLinecap="round" opacity={dim ? 0.3 : 1} />;
  });

  const boundaries = L.boundaries.map((g) => {
    const r = scene.ranges.get(g.id);
    if (!r) return null;
    const own = cleanStyle(r.range.style);
    const color = (own.border as string | undefined) ?? (own.lineColor as string | undefined) ?? scene.styles.get(r.range.from)?.branchColor ?? P.relationship;
    const fill = (own.fill as string | undefined) ?? withAlpha(color, 0.07);
    const selected = sel.has(g.id);
    const label = r.range.text;
    return (
      <g key={g.id} data-kind="boundary" data-id={g.id}>
        <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={10} fill={fill === "none" ? "transparent" : fill} stroke={color} strokeWidth={1.5} strokeDasharray="6 4" />
        {label && (
          <g>
            <rect x={g.x} y={g.y} width={Math.min(g.w, label.length * 13 + 20)} height={20} rx={10} fill={color} />
            <text x={g.x + 10} y={g.y + 10} dy="0.35em" fontSize={12} fill="#fff" fontFamily={P.fontFamily} fontWeight={500}>
              {label}
            </text>
          </g>
        )}
        {selected && <rect className="wm-ui" x={g.x - 3} y={g.y - 3} width={g.w + 6} height={g.h + 6} rx={12} fill="none" stroke={SELECTION_COLOR} strokeWidth={2} />}
      </g>
    );
  });

  const summaries = L.summaries.map((g) => {
    const st = scene.styles.get(g.id);
    return <path key={g.id} d={bracketPath(g)} fill="none" stroke={st?.border !== "none" ? st?.border : st.branchColor} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />;
  });

  const rels = (doc.relationships ?? []).map((r) => {
    const a = L.nodes.get(r.from);
    const b = L.nodes.get(r.to);
    if (!a || !b) return null;
    const live = drag?.mode === "handle" && drag.relId === r.id ? drag.controls : r.controls;
    const g = relationshipGeom(a, b, live);
    const own = cleanStyle(r.style, true);
    const color = (own.lineColor as string | undefined) ?? P.relationship;
    const width = (own.lineWidth as number | undefined) ?? 1.6;
    const dashed = own.lineStyle !== "solid";
    const selected = sel.has(r.id);
    const ah = 8 + width * 1.5;
    const arrow = `M${g.end.x},${g.end.y} L${g.end.x - ah * Math.cos(g.angle - 0.42)},${g.end.y - ah * Math.sin(g.angle - 0.42)} L${g.end.x - ah * Math.cos(g.angle + 0.42)},${g.end.y - ah * Math.sin(g.angle + 0.42)} Z`;
    return (
      <g key={r.id} data-kind="rel" data-id={r.id}>
        <path d={g.d} fill="none" stroke="transparent" strokeWidth={14} />
        <path d={g.d} fill="none" stroke={selected ? SELECTION_COLOR : color} strokeWidth={width} strokeDasharray={dashed ? "6 5" : undefined} strokeLinecap="round" />
        <path d={arrow} fill={selected ? SELECTION_COLOR : color} />
        {r.text && (
          <g>
            <rect x={g.mid.x - (r.text.length * 13 + 16) / 2} y={g.mid.y - 11} width={r.text.length * 13 + 16} height={22} rx={6} fill={P.background} />
            <text x={g.mid.x} y={g.mid.y} dy="0.35em" textAnchor="middle" fontSize={13} fill={color} fontFamily={P.fontFamily}>
              {r.text}
            </text>
          </g>
        )}
        {selected && !readOnly && (
          <g className="wm-ui">
            <line x1={g.start.x} y1={g.start.y} x2={g.c1.x} y2={g.c1.y} stroke={SELECTION_COLOR} strokeWidth={1} strokeDasharray="3 3" />
            <line x1={g.end.x} y1={g.end.y} x2={g.c2.x} y2={g.c2.y} stroke={SELECTION_COLOR} strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={g.c1.x} cy={g.c1.y} r={6} fill="#fff" stroke={SELECTION_COLOR} strokeWidth={2} data-kind="handle" data-rel={r.id} data-which={0} style={{ cursor: "move" }} />
            <circle cx={g.c2.x} cy={g.c2.y} r={6} fill="#fff" stroke={SELECTION_COLOR} strokeWidth={2} data-kind="handle" data-rel={r.id} data-which={1} style={{ cursor: "move" }} />
          </g>
        )}
      </g>
    );
  });

  const renderNode = (box: NodeBox, ghost = false) => {
    const isSummary = box.kind === "summary";
    const st = scene.styles.get(box.id);
    const m = scene.metrics.get(box.id);
    if (!st || !m) return null;
    const content = isSummary ? { text: scene.ranges.get(box.id)?.range.text ?? "" } : scene.topics.get(box.id)!;
    const topic = isSummary ? null : scene.topics.get(box.id)!;
    const hasKids = !!topic?.children?.length;
    const canFold = hasKids && !(box.id === doc.root.id);
    const dropTarget = nodeDrag?.drop?.type === "child" && nodeDrag.drop.parentId === box.id;
    return (
      <TopicNode
        key={(ghost ? "g-" : "") + box.id}
        box={ghost ? { ...box, x: box.x + nodeDrag!.dx, y: box.y + nodeDrag!.dy } : box}
        style={st}
        m={m}
        content={content}
        selected={!ghost && sel.has(box.id)}
        dropTarget={!ghost && dropTarget}
        fold={canFold && !ghost ? { collapsed: !!topic!.collapsed, count: topic!.collapsed ? countDescendants(topic!) : 0 } : undefined}
        ghost={ghost}
        background={P.background}
      />
    );
  };

  const nodes = [...L.nodes.values()];
  const v = viewport;
  const marquee = drag?.mode === "marquee" ? normRect(drag.x0, drag.y0, drag.x1, drag.y1) : null;
  const linkSrc = linkingFrom ? L.nodes.get(linkingFrom) : null;

  return (
    <div
      ref={wrapRef}
      className={"wm-canvas" + (drag?.mode === "pan" ? " wm-panning" : "") + (linkingFrom ? " wm-linking" : "")}
      style={{ background: P.background }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onMouseMove={onMouseMove}
    >
      <svg className="wm-svg" width="100%" height="100%">
        <g className="wm-world" transform={`translate(${v.x},${v.y}) scale(${v.k})`}>
          <g>{boundaries}</g>
          <g>{edges}</g>
          <g>{summaries}</g>
          <g>{nodes.map((b) => (dragging.has(b.id) ? <g key={b.id} opacity={0.35}>{renderNode(b)}</g> : renderNode(b)))}</g>
          <g>{rels}</g>
          {nodeDrag && <g className="wm-ui">{nodes.filter((b) => dragging.has(b.id)).map((b) => renderNode(b, true))}</g>}
          {nodeDrag?.drop?.type === "sibling" && (
            <line
              className="wm-ui"
              x1={nodeDrag.drop.line[0].x}
              y1={nodeDrag.drop.line[0].y}
              x2={nodeDrag.drop.line[1].x}
              y2={nodeDrag.drop.line[1].y}
              stroke={SELECTION_COLOR}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
          {marquee && <rect className="wm-ui" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={withAlpha(SELECTION_COLOR, 0.08)} stroke={SELECTION_COLOR} strokeWidth={1 / v.k} />}
          {linkSrc && pointer && (
            <line
              className="wm-ui"
              x1={linkSrc.x + linkSrc.w / 2}
              y1={linkSrc.y + linkSrc.h / 2}
              x2={pointer.x}
              y2={pointer.y}
              stroke={P.relationship}
              strokeWidth={1.6}
              strokeDasharray="6 5"
            />
          )}
        </g>
      </svg>
    </div>
  );
}

function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const k = Math.max(0.1, Math.min(4, v.k * factor));
  const f = k / v.k;
  return { k, x: sx - (sx - v.x) * f, y: sy - (sy - v.y) * f };
}

export { rectContains };

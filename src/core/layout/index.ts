// 布局引擎:输入文档 + 每个节点的尺寸,输出坐标。纯函数,不依赖 DOM。
// 每棵子树先在「以自身节点左上角为原点」的局部坐标里排好,再由父节点整体平移拼装,
// 因此不同结构(逻辑图 / 组织结构图 / 树形图)可以在任意分支上混用。
import { DEFAULT_STRUCTURE, MindDoc, Range, Structure, STRUCTURES, Topic } from "../types";
import { BoundaryGeo, Dir, Edge, LayoutResult, NodeBox, NodeSize, Orient, Rect, SummaryGeo } from "./types";

export * from "./types";

export const SPACING = {
  /** 中心主题到一级分支的水平距离 */
  rootGapX: 56,
  gapX: 32,
  rootGapY: 18,
  gapY: 10,
  orgGapY: 40,
  orgGapX: 16,
  treeIndent: 28,
  treeGapY: 12,
  /** 外框内边距 / 标题高度 */
  boundaryPad: 8,
  boundaryLabel: 22,
  /** 概括括号的宽度与到概括主题的距离 */
  bracket: 12,
  bracketGap: 8,
};

interface Sub {
  nodes: NodeBox[];
  edges: Edge[];
  summaries: SummaryGeo[];
  boundaries: BoundaryGeo[];
  /** 子树包围盒(局部坐标) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Ctx {
  sizes: Map<string, NodeSize>;
}

const FALLBACK: NodeSize = { w: 80, h: 30 };

function size(ctx: Ctx, id: string): NodeSize {
  return ctx.sizes.get(id) ?? FALLBACK;
}

function validStructure(s: unknown): Structure | undefined {
  return STRUCTURES.includes(s as Structure) ? (s as Structure) : undefined;
}

function translate(sub: Sub, dx: number, dy: number) {
  for (const n of sub.nodes) {
    n.x += dx;
    n.y += dy;
    n.outX += dx;
    n.outY += dy;
  }
  for (const e of sub.edges) {
    e.x1 += dx;
    e.x2 += dx;
    e.y1 += dy;
    e.y2 += dy;
  }
  for (const s of sub.summaries) {
    s.x0 += dx;
    s.x1 += dx;
    s.y0 += dy;
    s.y1 += dy;
  }
  for (const b of sub.boundaries) {
    b.x += dx;
    b.y += dy;
  }
  sub.x0 += dx;
  sub.x1 += dx;
  sub.y0 += dy;
  sub.y1 += dy;
}

function merge(into: Sub, sub: Sub) {
  into.nodes.push(...sub.nodes);
  into.edges.push(...sub.edges);
  into.summaries.push(...sub.summaries);
  into.boundaries.push(...sub.boundaries);
  grow(into, sub);
}

function grow(s: Sub, r: { x0: number; y0: number; x1: number; y1: number }) {
  s.x0 = Math.min(s.x0, r.x0);
  s.y0 = Math.min(s.y0, r.y0);
  s.x1 = Math.max(s.x1, r.x1);
  s.y1 = Math.max(s.y1, r.y1);
}

/** 连线接入点在节点里的纵向位置 */
function anchorY(sz: NodeSize): number {
  return sz.underline ? sz.h : sz.h / 2;
}

function leaf(t: Topic, ctx: Ctx, depth: number, orient: Orient, dir: Dir): Sub {
  const sz = size(ctx, t.id);
  const node: NodeBox = { id: t.id, kind: "topic", depth, x: 0, y: 0, w: sz.w, h: sz.h, orient, dir, outX: 0, outY: 0 };
  setOut(node, sz, orient, dir);
  return { nodes: [node], edges: [], summaries: [], boundaries: [], x0: 0, y0: 0, x1: sz.w, y1: sz.h };
}

function setOut(n: NodeBox, sz: NodeSize, orient: Orient, dir: Dir) {
  if (orient === "h") {
    n.outX = n.x + (dir === 1 ? sz.w : 0);
    n.outY = n.y + anchorY(sz);
  } else if (orient === "v") {
    n.outX = n.x + sz.w / 2;
    n.outY = n.y + sz.h;
  } else {
    const inset = Math.min(SPACING.treeIndent / 2, sz.w / 2);
    n.outX = n.x + (dir === 1 ? inset : sz.w - inset);
    n.outY = n.y + sz.h;
  }
}

function visibleChildren(t: Topic): Topic[] {
  return t.collapsed ? [] : (t.children ?? []);
}

/** 排一棵子树。structure 为父级传下来的结构,节点自己的 structure 优先 */
function layoutTopic(t: Topic, ctx: Ctx, depth: number, inherited: Structure, dir: Dir): Sub {
  let st = validStructure(t.structure) ?? inherited;
  if (st === "map") st = "logic"; // map 只用于中心主题
  const orient: Orient = st === "org" ? "v" : st === "tree" ? "tree" : "h";
  const sub = leaf(t, ctx, depth, orient, dir);
  const children = visibleChildren(t);
  if (!children.length) return sub;
  const subs = children.map((c) => layoutTopic(c, ctx, depth + 1, st, dir));
  const extra = rangeGaps(t, children);
  if (orient === "h") stackHorizontal(t, ctx, sub, subs, children, extra, depth, dir);
  else if (orient === "v") stackOrg(t, ctx, sub, subs, children, extra);
  else stackTree(t, ctx, sub, subs, children, extra, dir);
  addRanges(t, ctx, sub, children, subs, depth, orient === "v" ? "down" : dir === 1 ? "right" : "left");
  return sub;
}

/** 外框会向外扩出内边距,相邻子树之间要多留出这段距离 */
function rangeGaps(t: Topic, children: Topic[]): number[] {
  const extra = new Array(children.length).fill(0);
  for (const b of t.boundaries ?? []) {
    const [a, z] = rangeIdx(children, b);
    if (a < 0) continue;
    extra[a] += SPACING.boundaryPad + (b.text ? SPACING.boundaryLabel : 0);
    if (z + 1 < children.length) extra[z + 1] += SPACING.boundaryPad;
  }
  return extra;
}

function rangeIdx(children: Topic[], r: Range): [number, number] {
  const a = children.findIndex((c) => c.id === r.from);
  const b = children.findIndex((c) => c.id === r.to);
  if (a < 0 || b < 0) return [-1, -1];
  return [Math.min(a, b), Math.max(a, b)];
}

/** 逻辑图:子树在父节点右侧(dir=1)或左侧(dir=-1)纵向排开,整体与父节点连线点居中对齐 */
function stackHorizontal(t: Topic, ctx: Ctx, sub: Sub, subs: Sub[], children: Topic[], extra: number[], depth: number, dir: Dir, fromRoot = false) {
  const psz = size(ctx, t.id);
  const parent = sub.nodes[0];
  const gapX = depth === 0 ? SPACING.rootGapX : SPACING.gapX;
  const gapY = depth === 0 ? SPACING.rootGapY : SPACING.gapY;
  let total = 0;
  subs.forEach((s, i) => (total += s.y1 - s.y0 + (i ? gapY : 0) + extra[i]));
  const ay = fromRoot ? psz.h / 2 : anchorY(psz);
  let cursor = ay - total / 2;
  subs.forEach((s, i) => {
    cursor += extra[i] + (i ? gapY : 0);
    const csz = size(ctx, children[i].id);
    const cx = dir === 1 ? psz.w + gapX : -gapX - csz.w;
    translate(s, cx, cursor - s.y0);
    cursor += s.y1 - s.y0;
    const child = s.nodes[0];
    sub.edges.push({
      from: t.id,
      to: child.id,
      x1: fromRoot ? psz.w / 2 : parent.outX,
      y1: fromRoot ? psz.h / 2 : parent.outY,
      x2: child.x + (dir === 1 ? 0 : csz.w),
      y2: child.y + anchorY(csz),
      orient: "h",
      fromRoot,
    });
    child.parentId = t.id;
    merge(sub, s);
  });
}

/** 组织结构图:子树在父节点下方横向排开,整体与父节点水平居中 */
function stackOrg(t: Topic, ctx: Ctx, sub: Sub, subs: Sub[], children: Topic[], extra: number[]) {
  const psz = size(ctx, t.id);
  const parent = sub.nodes[0];
  let total = 0;
  subs.forEach((s, i) => (total += s.x1 - s.x0 + (i ? SPACING.orgGapX : 0) + extra[i]));
  let cursor = psz.w / 2 - total / 2;
  subs.forEach((s, i) => {
    cursor += extra[i] + (i ? SPACING.orgGapX : 0);
    translate(s, cursor - s.x0, psz.h + SPACING.orgGapY);
    cursor += s.x1 - s.x0;
    const child = s.nodes[0];
    sub.edges.push({ from: t.id, to: child.id, x1: parent.outX, y1: parent.outY, x2: child.x + child.w / 2, y2: child.y, orient: "v", fromRoot: false });
    child.parentId = t.id;
    merge(sub, s);
  });
}

/** 树形图:子节点在父节点下方缩进、纵向排列 */
function stackTree(t: Topic, ctx: Ctx, sub: Sub, subs: Sub[], children: Topic[], extra: number[], dir: Dir) {
  const psz = size(ctx, t.id);
  const parent = sub.nodes[0];
  let cursor = psz.h + SPACING.treeGapY;
  subs.forEach((s, i) => {
    cursor += extra[i] + (i ? SPACING.treeGapY : 0);
    const csz = size(ctx, children[i].id);
    const cx = dir === 1 ? SPACING.treeIndent : psz.w - SPACING.treeIndent - csz.w;
    translate(s, cx, cursor - s.y0);
    cursor += s.y1 - s.y0;
    const child = s.nodes[0];
    sub.edges.push({
      from: t.id,
      to: child.id,
      x1: parent.outX,
      y1: parent.outY,
      x2: child.x + (dir === 1 ? 0 : csz.w),
      y2: child.y + anchorY(csz),
      orient: "tree",
      fromRoot: false,
    });
    child.parentId = t.id;
    merge(sub, s);
  });
}

/** 概括与外框:根据范围内子树的包围盒计算 */
function addRanges(t: Topic, ctx: Ctx, sub: Sub, children: Topic[], subs: Sub[], depth: number, side: "right" | "left" | "down", filter?: (i: number) => boolean) {
  const span = (r: Range) => {
    const [a, b] = rangeIdx(children, r);
    if (a < 0) return null;
    let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (let i = a; i <= b; i++) {
      if (filter && !filter(i)) continue;
      const s = subs[i];
      box = box ? { x0: Math.min(box.x0, s.x0), y0: Math.min(box.y0, s.y0), x1: Math.max(box.x1, s.x1), y1: Math.max(box.y1, s.y1) } : { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 };
    }
    return box;
  };
  for (const b of t.boundaries ?? []) {
    if (filter && !filter(rangeIdx(children, b)[0])) continue;
    const box = span(b);
    if (!box) continue;
    const p = SPACING.boundaryPad;
    const top = p + (b.text ? SPACING.boundaryLabel : 0);
    const g: BoundaryGeo = { id: b.id, ownerId: t.id, x: box.x0 - p, y: box.y0 - top, w: box.x1 - box.x0 + 2 * p, h: box.y1 - box.y0 + top + p };
    sub.boundaries.push(g);
    grow(sub, { x0: g.x, y0: g.y, x1: g.x + g.w, y1: g.y + g.h });
  }
  /** 已放好的概括(括号 + 概括主题)占用的区域,后面的概括与之重叠时向外让开 */
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const s of t.summaries ?? []) {
    if (filter && !filter(rangeIdx(children, s)[0])) continue;
    const box = span(s);
    if (!box) continue;
    for (const q of placed) {
      if (side === "down") {
        if (q.x0 < box.x1 && q.x1 > box.x0) box.y1 = Math.max(box.y1, q.y1);
      } else if (q.y0 < box.y1 && q.y1 > box.y0) {
        if (side === "right") box.x1 = Math.max(box.x1, q.x1);
        else box.x0 = Math.min(box.x0, q.x0);
      }
    }
    // 括号要把同一范围上的外框也包进去
    for (const g of sub.boundaries) {
      if (g.ownerId !== t.id) continue;
      if (g.x >= box.x0 - SPACING.boundaryPad - 1 && g.x + g.w <= box.x1 + SPACING.boundaryPad + 1 && g.y + g.h > box.y0 && g.y < box.y1) {
        box.x0 = Math.min(box.x0, g.x);
        box.x1 = Math.max(box.x1, g.x + g.w);
        box.y0 = Math.min(box.y0, g.y);
        box.y1 = Math.max(box.y1, g.y + g.h);
      }
    }
    const sz = size(ctx, s.id);
    const B = SPACING.bracket;
    const G = SPACING.bracketGap;
    let geo: SummaryGeo;
    let nx: number;
    let ny: number;
    if (side === "down") {
      geo = { id: s.id, ownerId: t.id, side, x0: box.x0, y0: box.y1 + G, x1: box.x1, y1: box.y1 + G + B };
      nx = (box.x0 + box.x1) / 2 - sz.w / 2;
      ny = geo.y1 + G;
    } else if (side === "right") {
      geo = { id: s.id, ownerId: t.id, side, x0: box.x1 + G, y0: box.y0, x1: box.x1 + G + B, y1: box.y1 };
      nx = geo.x1 + G;
      ny = (box.y0 + box.y1) / 2 - sz.h / 2;
    } else {
      geo = { id: s.id, ownerId: t.id, side, x0: box.x0 - G - B, y0: box.y0, x1: box.x0 - G, y1: box.y1 };
      nx = geo.x0 - G - sz.w;
      ny = (box.y0 + box.y1) / 2 - sz.h / 2;
    }
    sub.summaries.push(geo);
    placed.push({ x0: Math.min(geo.x0, nx), y0: Math.min(geo.y0, ny), x1: Math.max(geo.x1, nx + sz.w), y1: Math.max(geo.y1, ny + sz.h) });
    const node: NodeBox = { id: s.id, kind: "summary", depth: depth + 1, parentId: t.id, x: nx, y: ny, w: sz.w, h: sz.h, orient: "h", dir: side === "left" ? -1 : 1, outX: 0, outY: 0 };
    sub.nodes.push(node);
    grow(sub, { x0: Math.min(geo.x0, nx), y0: Math.min(geo.y0, ny), x1: Math.max(geo.x1, nx + sz.w), y1: Math.max(geo.y1, ny + sz.h) });
  }
}

/** 思维导图:一级分支左右平衡,右侧从上到下、左侧从下到上(顺时针) */
function layoutMapRoot(root: Topic, ctx: Ctx): Sub {
  const sub = leaf(root, ctx, 0, "h", 1);
  const children = visibleChildren(root);
  if (!children.length) return sub;
  const nRight = Math.ceil(children.length / 2);
  const rightIdx = children.map((_, i) => i).slice(0, nRight);
  const leftIdx = children.map((_, i) => i).slice(nRight).reverse();
  const allSubs: Sub[] = new Array(children.length);
  for (const [idxs, dir] of [
    [rightIdx, 1],
    [leftIdx, -1],
  ] as [number[], Dir][]) {
    if (!idxs.length) continue;
    const subs = idxs.map((i) => layoutTopic(children[i], ctx, 1, "logic", dir));
    idxs.forEach((i, k) => (allSubs[i] = subs[k]));
    const side = idxs.map((i) => children[i]);
    stackHorizontal(root, ctx, sub, subs, side, rangeGaps(root, side), 0, dir, true);
  }
  const rightSet = new Set(rightIdx);
  addRanges(root, ctx, sub, children, allSubs, 0, "right", (i) => rightSet.has(i));
  addRanges(root, ctx, sub, children, allSubs, 0, "left", (i) => !rightSet.has(i));
  return sub;
}

/** 整张图的结构:文档设置 → 中心主题自己的设置 → 默认 */
export function rootStructure(doc: MindDoc): Structure {
  return validStructure(doc.root.structure) ?? validStructure(doc.structure) ?? DEFAULT_STRUCTURE;
}

/**
 * 排版整张图。坐标系以中心主题的中心为原点;自由主题的 position 是它左上角相对原点的坐标。
 */
export function layout(doc: MindDoc, sizes: Map<string, NodeSize>): LayoutResult {
  const ctx: Ctx = { sizes };
  const st = rootStructure(doc);
  const main = st === "map" ? layoutMapRoot(doc.root, ctx) : layoutTopic(doc.root, ctx, 0, st, 1);
  const rsz = size(ctx, doc.root.id);
  translate(main, -rsz.w / 2, -rsz.h / 2);
  const all: Sub = { nodes: [], edges: [], summaries: [], boundaries: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  merge(all, main);
  for (const f of doc.floating ?? []) {
    const fs = layoutTopic(f, ctx, 0, "logic", 1);
    fs.nodes[0].floatingRoot = true;
    translate(fs, f.position?.x ?? 0, f.position?.y ?? 0);
    merge(all, fs);
  }
  const nodes = new Map<string, NodeBox>();
  for (const n of all.nodes) nodes.set(n.id, n);
  const bounds: Rect = { x: all.x0, y: all.y0, w: all.x1 - all.x0, h: all.y1 - all.y0 };
  return { nodes, edges: all.edges, summaries: all.summaries, boundaries: all.boundaries, bounds };
}

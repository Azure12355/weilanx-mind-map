// 连线、概括括号、联系线的路径计算(SVG path 字符串)
import { LineStyle, Point } from "../types";
import { Edge, Rect, SummaryGeo } from "./types";

const f = (n: number) => Math.round(n * 10) / 10;

/**
 * 父 → 子连线。inset:曲线起点往父节点内部缩进的距离(被父节点色块或下划线盖住),
 * 让线从父节点边缘斜着散出,而不是从一个点水平挤出。
 */
export function edgePath(e: Edge, style: LineStyle, inset = 0): string {
  const { x1, y1, x2, y2 } = e;
  if (style === "straight") return `M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}`;
  if (e.orient === "tree") {
    const r = Math.min(8, Math.abs(y2 - y1), Math.abs(x2 - x1));
    const sx = Math.sign(x2 - x1) || 1;
    if (style === "curve") return `M${f(x1)},${f(y1)} L${f(x1)},${f(y2 - r * 2)} Q${f(x1)},${f(y2)} ${f(x1 + sx * r * 2)},${f(y2)} L${f(x2)},${f(y2)}`;
    return `M${f(x1)},${f(y1)} L${f(x1)},${f(y2 - r)} Q${f(x1)},${f(y2)} ${f(x1 + sx * r)},${f(y2)} L${f(x2)},${f(y2)}`;
  }
  if (e.orient === "v") {
    const my = (y1 + y2) / 2;
    if (style === "curve") return `M${f(x1)},${f(y1)} C${f(x1)},${f(my)} ${f(x2)},${f(my)} ${f(x2)},${f(y2)}`;
    return elbow(x1, y1, x2, y2, true);
  }
  const mx = e.fromRoot ? x1 + (x2 - x1) * 0.45 : (x1 + x2) / 2;
  if (style === "curve") {
    if (e.fromRoot) return `M${f(x1)},${f(y1)} C${f(x1 + (x2 - x1) * 0.25)},${f(y1)} ${f(mx)},${f(y2)} ${f(x2)},${f(y2)}`;
    // 二次曲线:斜着出、平着收进子节点的下划线,整条线只有一个平滑的弯,
    // 上下跨度大时也不会出现「竖墙」或两头急转
    const p = x1 - Math.sign(x2 - x1 || 1) * inset;
    return `M${f(p)},${f(y1)} Q${f(p + (x2 - p) * 0.45)},${f(y2)} ${f(x2)},${f(y2)}`;
  }
  return elbow(x1, y1, x2, y2, false, mx);
}

/** 圆角折线:先水平再竖直再水平(vertical=true 时先竖直) */
function elbow(x1: number, y1: number, x2: number, y2: number, vertical: boolean, mid?: number): string {
  if (vertical) {
    const my = (y1 + y2) / 2;
    const r = Math.min(8, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
    if (r < 1) return `M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}`;
    const sx = Math.sign(x2 - x1);
    return `M${f(x1)},${f(y1)} L${f(x1)},${f(my - r)} Q${f(x1)},${f(my)} ${f(x1 + sx * r)},${f(my)} L${f(x2 - sx * r)},${f(my)} Q${f(x2)},${f(my)} ${f(x2)},${f(my + r)} L${f(x2)},${f(y2)}`;
  }
  const mx = mid ?? (x1 + x2) / 2;
  const r = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(mx - x1));
  if (r < 1) return `M${f(x1)},${f(y1)} L${f(mx)},${f(y1)} L${f(mx)},${f(y2)} L${f(x2)},${f(y2)}`;
  const sx = Math.sign(x2 - x1) || 1;
  const sy = Math.sign(y2 - y1);
  return `M${f(x1)},${f(y1)} L${f(mx - sx * r)},${f(y1)} Q${f(mx)},${f(y1)} ${f(mx)},${f(y1 + sy * r)} L${f(mx)},${f(y2 - sy * r)} Q${f(mx)},${f(y2)} ${f(mx + sx * r)},${f(y2)} L${f(x2)},${f(y2)}`;
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** 中心主题出发的由粗到细的曲线:返回填充用的闭合路径 */
export function taperPath(e: Edge, startWidth: number, endWidth: number): string {
  const { x1, y1, x2, y2 } = e;
  const p0 = { x: x1, y: y1 };
  const p1 = { x: x1 + (x2 - x1) * 0.25, y: y1 };
  const p2 = { x: x1 + (x2 - x1) * 0.45, y: y2 };
  const p3 = { x: x2, y: y2 };
  const N = 20;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = cubic(p0, p1, p2, p3, t);
    const q = cubic(p0, p1, p2, p3, Math.min(1, t + 0.01));
    const r = cubic(p0, p1, p2, p3, Math.max(0, t - 0.01));
    let dx = q.x - r.x;
    let dy = q.y - r.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = (startWidth + (endWidth - startWidth) * t) / 2;
    left.push({ x: p.x - dy * w, y: p.y + dx * w });
    right.push({ x: p.x + dy * w, y: p.y - dx * w });
  }
  const pts = [...left, ...right.reverse()];
  return "M" + pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" L") + " Z";
}

/** 概括的大括号 */
export function bracketPath(g: SummaryGeo): string {
  if (g.side === "down") {
    const { x0, x1, y0, y1 } = g;
    const ym = (y0 + y1) / 2;
    const xm = (x0 + x1) / 2;
    const r = Math.min(6, (x1 - x0) / 4);
    return `M${f(x0)},${f(y0)} Q${f(x0)},${f(ym)} ${f(x0 + r)},${f(ym)} L${f(xm - r)},${f(ym)} Q${f(xm)},${f(ym)} ${f(xm)},${f(y1)} Q${f(xm)},${f(ym)} ${f(xm + r)},${f(ym)} L${f(x1 - r)},${f(ym)} Q${f(x1)},${f(ym)} ${f(x1)},${f(y0)}`;
  }
  const { y0, y1 } = g;
  const [xa, xb] = g.side === "right" ? [g.x0, g.x1] : [g.x1, g.x0];
  const xm = (xa + xb) / 2;
  const ym = (y0 + y1) / 2;
  const r = Math.min(6, (y1 - y0) / 4);
  return `M${f(xa)},${f(y0)} Q${f(xm)},${f(y0)} ${f(xm)},${f(y0 + r)} L${f(xm)},${f(ym - r)} Q${f(xm)},${f(ym)} ${f(xb)},${f(ym)} Q${f(xm)},${f(ym)} ${f(xm)},${f(ym + r)} L${f(xm)},${f(y1 - r)} Q${f(xm)},${f(y1)} ${f(xa)},${f(y1)}`;
}

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** 从矩形中心朝 toward 方向的射线与矩形边框(外扩 margin)的交点 */
export function rectEdgePoint(r: Rect, toward: Point, margin = 4): Point {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const hw = r.w / 2 + margin;
  const hh = r.h / 2 + margin;
  const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export interface RelGeom {
  d: string;
  start: Point;
  end: Point;
  c1: Point;
  c2: Point;
  mid: Point;
  /** 终点箭头方向(弧度) */
  angle: number;
}

/** 默认控制点:两端连线的法线方向拱起 */
export function defaultControls(a: Rect, b: Rect): [Point, Point] {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(90, len * 0.35);
  const nx = (dy / len) * bow;
  const ny = (-dx / len) * bow;
  return [
    { x: f(dx * 0.25 + nx), y: f(dy * 0.25 + ny) },
    { x: f(-dx * 0.25 + nx), y: f(-dy * 0.25 + ny) },
  ];
}

export function relationshipGeom(a: Rect, b: Rect, controls?: [Point, Point]): RelGeom {
  const [o1, o2] = controls ?? defaultControls(a, b);
  const ca = center(a);
  const cb = center(b);
  const c1 = { x: ca.x + o1.x, y: ca.y + o1.y };
  const c2 = { x: cb.x + o2.x, y: cb.y + o2.y };
  const start = rectEdgePoint(a, c1);
  const end = rectEdgePoint(b, c2, 6);
  const mid = cubic(start, c1, c2, end, 0.5);
  const angle = Math.atan2(end.y - c2.y, end.x - c2.x);
  const d = `M${f(start.x)},${f(start.y)} C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(end.x)},${f(end.y)}`;
  return { d, start, end, c1, c2, mid, angle };
}

export function rectContains(r: Rect, p: Point, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/** 点到矩形的距离(在内部为 0) */
export function rectDistance(r: Rect, p: Point): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

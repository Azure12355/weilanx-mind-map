// 手绘画法:用 rough.js 生成 Excalidraw 风格的抖动线条和斜线填充,输出普通 SVG path
// 参数照搬 Excalidraw(scene/Shape.ts):roughness 1、fillWeight = 线宽 / 2、hachureGap = 线宽 × 4
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { FillStyle, Shape } from "../../src/core/types";

export type RoughGeo =
  | { t: "shape"; shape: Shape; w: number; h: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number }
  | { t: "path"; d: string; size: number };

export interface RoughStyle {
  stroke: string;
  strokeWidth: number;
  /** 没有或 "none" 表示不填充 */
  fill?: string;
  fillStyle?: Exclude<FillStyle, "none">;
  dashed?: boolean;
  /** 上限,用于箭头等小元素 */
  maxRoughness?: number;
}

interface RPath {
  d: string;
  stroke?: string;
  fill?: string;
  width?: number;
  dash?: string;
}

const gen = rough.generator();

/** id → rough 的随机种子:同一个元素每次画出来都一样 */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

/** Excalidraw 的 adjustRoughness:小图形抖得少一些 */
function roughnessFor(geo: RoughGeo): number {
  if (geo.t === "shape") {
    const max = Math.max(geo.w, geo.h);
    const min = Math.min(geo.w, geo.h);
    const round = geo.shape !== "rect";
    if ((min >= 20 && max >= 50) || (min >= 15 && round)) return 1;
    return Math.min(1 / (max < 10 ? 3 : 2), 2.5);
  }
  const len = geo.t === "line" ? Math.hypot(geo.x2 - geo.x1, geo.y2 - geo.y1) : geo.size;
  return len >= 50 ? 1 : 0.5;
}

/** Excalidraw 的自适应圆角 */
function cornerRadius(x: number): number {
  return x <= 128 ? x * 0.25 : 32;
}

function capsulePath(w: number, h: number): string {
  const r = h / 2;
  return `M${r},0 L${w - r},0 A${r},${r} 0 0 1 ${w - r},${h} L${r},${h} A${r},${r} 0 0 1 ${r},0 Z`;
}

const cache = new Map<string, RPath[]>();

function generate(seed: number, geo: RoughGeo, s: RoughStyle): RPath[] {
  const fill = s.fill && s.fill !== "none" && s.fill !== "transparent" ? s.fill : undefined;
  const dashed = !!s.dashed;
  const opts: Options = {
    seed,
    roughness: Math.min(roughnessFor(geo), s.maxRoughness ?? 1),
    stroke: s.stroke,
    strokeWidth: dashed ? s.strokeWidth + 0.5 : s.strokeWidth,
    fillWeight: s.strokeWidth / 2,
    hachureGap: s.strokeWidth * 4,
    disableMultiStroke: dashed,
    strokeLineDash: dashed ? [8, 8 + s.strokeWidth] : undefined,
    preserveVertices: true,
    fill,
    fillStyle: s.fillStyle ?? "hachure",
  };
  let drawable;
  if (geo.t === "line") drawable = gen.line(geo.x1, geo.y1, geo.x2, geo.y2, opts);
  else if (geo.t === "path") drawable = gen.path(geo.d, opts);
  else {
    const { w, h } = geo;
    switch (geo.shape) {
      case "rect":
        drawable = gen.rectangle(0, 0, w, h, opts);
        break;
      case "ellipse":
        drawable = gen.ellipse(w / 2, h / 2, w, h, { ...opts, curveFitting: 1 });
        break;
      case "capsule":
        drawable = gen.path(capsulePath(w, h), opts);
        break;
      case "underline":
        drawable = gen.line(0, h, w, h, opts);
        break;
      case "none":
        return [];
      case "rounded":
      default: {
        const r = cornerRadius(Math.min(w, h));
        drawable = gen.path(
          `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`,
          opts,
        );
      }
    }
  }
  const o = drawable.options;
  const dash = dashed ? `${8} ${8 + s.strokeWidth}` : undefined;
  const out: RPath[] = [];
  // 先画填充再画描边,和 Excalidraw 一致
  for (const set of drawable.sets) {
    const d = gen.opsToPath(set, 2);
    if (set.type === "fillPath") out.push({ d, fill: o.fill });
    else if (set.type === "fillSketch") out.push({ d, stroke: o.fill, width: o.fillWeight });
  }
  for (const set of drawable.sets) {
    if (set.type === "path" && o.stroke !== "none") out.push({ d: gen.opsToPath(set, 2), stroke: o.stroke, width: o.strokeWidth, dash });
  }
  return out;
}

export function roughPaths(id: string, geo: RoughGeo, s: RoughStyle): RPath[] {
  const key = id + "\u0001" + JSON.stringify(geo) + JSON.stringify(s);
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size > 6000) cache.clear();
    hit = generate(seedOf(id), geo, s);
    cache.set(key, hit);
  }
  return hit;
}

export function Rough({ id, geo, style, opacity }: { id: string; geo: RoughGeo; style: RoughStyle; opacity?: number }) {
  const paths = roughPaths(id, geo, style);
  return (
    <g opacity={opacity}>
      {paths.map((p, i) =>
        p.fill ? (
          <path key={i} d={p.d} fill={p.fill} stroke="none" />
        ) : (
          <path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeDasharray={p.dash} strokeLinecap="round" strokeLinejoin="round" />
        ),
      )}
    </g>
  );
}

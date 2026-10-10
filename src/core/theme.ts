// 内置主题,以及「主题默认值 ← 分支色 ← 节点 style 覆盖」合并出的最终样式
import { cleanStyle, docFillStyle, docLook, docTheme } from "./doc";
import { DEFAULT_FILL_STYLE, FillStyle, LineStyle, Look, MindDoc, Shape, Style, TextAlign, Topic } from "./types";

export type TopicKind = "root" | "main" | "sub" | "floating" | "summary";

/** 颜色可以是具体值,也可以是 "branch"(用分支色)/ "tint"(分支色的浅色)/ "auto"(按底色自动黑白)/ "none" */
interface LevelStyle {
  shape: Shape;
  fill: string;
  border: string;
  borderWidth: number;
  textColor: string;
  fontSize: number;
  bold: boolean;
  lineWidth: number;
  padX: number;
  padY: number;
}

export interface Palette {
  background: string;
  /** 子主题等「无底色」文字的颜色 */
  text: string;
  rainbow: string[];
  fontFamily: string;
  lineStyle: LineStyle;
  relationship: string;
  root: LevelStyle;
  main: LevelStyle;
  sub: LevelStyle;
  floating: LevelStyle;
  summary: LevelStyle;
}

export interface ThemeDef {
  id: string;
  zh: string;
  en: string;
  light: Palette;
  dark: Palette;
}

export interface ResolvedStyle {
  kind: TopicKind;
  depth: number;
  branchColor: string;
  shape: Shape;
  /** "none" 表示无填充 */
  fill: string;
  /** "none" 表示无边框 */
  border: string;
  borderWidth: number;
  textColor: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  /** 连向子节点的线 */
  lineColor: string;
  lineWidth: number;
  lineStyle: LineStyle;
  fontFamily: string;
  padX: number;
  padY: number;
  /** 手绘画法:形状和线条交给 rough.js */
  hand: boolean;
  /** 手绘画法下的填充样式;标准画法恒为 solid */
  fillStyle: FillStyle;
  textAlign: TextAlign;
}

export const SELECTION_COLOR = "#2F7BFF";

const SANS = `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`;

function lv(base: LevelStyle, patch: Partial<LevelStyle> = {}): LevelStyle {
  return { ...base, ...patch };
}

const ROOT: LevelStyle = { shape: "rounded", fill: "#1F2D3D", border: "none", borderWidth: 0, textColor: "auto", fontSize: 26, bold: true, lineWidth: 3, padX: 26, padY: 14 };
const MAIN: LevelStyle = { shape: "rounded", fill: "branch", border: "none", borderWidth: 0, textColor: "auto", fontSize: 17, bold: false, lineWidth: 2, padX: 16, padY: 9 };
const SUB: LevelStyle = { shape: "underline", fill: "none", border: "branch", borderWidth: 2, textColor: "text", fontSize: 14, bold: false, lineWidth: 1.5, padX: 4, padY: 5 };
const FLOAT: LevelStyle = { shape: "rounded", fill: "#EEF1F5", border: "none", borderWidth: 0, textColor: "auto", fontSize: 15, bold: false, lineWidth: 1.5, padX: 14, padY: 8 };
const SUMMARY: LevelStyle = { shape: "rounded", fill: "none", border: "branch", borderWidth: 1.5, textColor: "text", fontSize: 14, bold: false, lineWidth: 1.5, padX: 12, padY: 6 };

function palette(p: Partial<Palette> & Pick<Palette, "background" | "text" | "rainbow">): Palette {
  return {
    fontFamily: SANS,
    lineStyle: "curve",
    relationship: "#8A94A6",
    root: ROOT,
    main: MAIN,
    sub: SUB,
    floating: FLOAT,
    summary: SUMMARY,
    ...p,
  };
}

const CLASSIC_RAINBOW = ["#F0604D", "#F5A623", "#3DB47A", "#2F9BEA", "#7C63F2", "#E3578F"];
const FRESH_RAINBOW = ["#3FB68E", "#4BAEE3", "#F0B43C", "#EE8070", "#9A86E8", "#4EC0C8"];
const BUSINESS_RAINBOW = ["#1F5FAD", "#2E7DD1", "#1E8C9E", "#4A6FA5", "#2C6E8F", "#5B7DB8"];
const NIGHT_RAINBOW = ["#FF5C8A", "#FFB547", "#3DDC97", "#38BDF8", "#A78BFA", "#F472B6"];
// Excalidraw 调色板:描边取 open-color 第 8 档,填充取第 2 档;暗色版取第 4 档
const EXCALI_RAINBOW = ["#e03131", "#1971c2", "#2f9e44", "#f08c00", "#6741d9", "#0c8599", "#c2255c", "#099268"];
const EXCALI_RAINBOW_DARK = ["#ff8787", "#74c0fc", "#8ce99a", "#ffd43b", "#b197fc", "#66d9e8", "#f783ac", "#63e6be"];
/** Excalidraw 描边色 → 同色系的浅色填充 */
const EXCALI_TINTS: Record<string, string> = {
  "#e03131": "#ffc9c9", "#1971c2": "#a5d8ff", "#2f9e44": "#b2f2bb", "#f08c00": "#ffec99",
  "#6741d9": "#d0bfff", "#0c8599": "#99e9f2", "#c2255c": "#fcc2d7", "#099268": "#96f2d7",
  "#1e1e1e": "#e9ecef",
};
/** 手绘画法的字体:Excalifont(西文)+ 小赖(中文),都由画布按需加载 */
export const HAND_FONT = `"WM Excalifont", "WM Xiaolai", ${SANS}`;

export const THEMES: ThemeDef[] = [
  {
    id: "classic",
    zh: "经典",
    en: "Classic",
    light: palette({ background: "#FAFBFC", text: "#2B2F36", rainbow: CLASSIC_RAINBOW }),
    dark: palette({
      background: "#1E1F22",
      text: "#E3E5E8",
      rainbow: CLASSIC_RAINBOW,
      relationship: "#8C96A8",
      root: lv(ROOT, { fill: "#F2F3F5" }),
      floating: lv(FLOAT, { fill: "#2E3036" }),
    }),
  },
  {
    id: "fresh",
    zh: "清新",
    en: "Fresh",
    light: palette({
      background: "#F4FBF8",
      text: "#24413A",
      rainbow: FRESH_RAINBOW,
      relationship: "#7FA89B",
      root: lv(ROOT, { fill: "#2E8B6E", shape: "capsule" }),
      main: lv(MAIN, { shape: "capsule" }),
      floating: lv(FLOAT, { fill: "#E3F3EC", shape: "capsule" }),
    }),
    dark: palette({
      background: "#14201C",
      text: "#D5EBE3",
      rainbow: FRESH_RAINBOW,
      relationship: "#6F9A8C",
      root: lv(ROOT, { fill: "#43B892", shape: "capsule" }),
      main: lv(MAIN, { shape: "capsule" }),
      floating: lv(FLOAT, { fill: "#22332D", shape: "capsule" }),
    }),
  },
  {
    id: "business",
    zh: "商务",
    en: "Business",
    light: palette({
      background: "#F3F5F8",
      text: "#1E2A3A",
      rainbow: BUSINESS_RAINBOW,
      lineStyle: "elbow",
      relationship: "#6B7A90",
      root: lv(ROOT, { shape: "rect", fill: "#0F2A4A" }),
      main: lv(MAIN, { shape: "rect" }),
      sub: lv(SUB, { shape: "rect", fill: "#FFFFFF", borderWidth: 1, padX: 10, padY: 5 }),
      floating: lv(FLOAT, { shape: "rect", fill: "#E4E9F0" }),
      summary: lv(SUMMARY, { shape: "rect" }),
    }),
    dark: palette({
      background: "#121821",
      text: "#DCE4EE",
      rainbow: BUSINESS_RAINBOW,
      lineStyle: "elbow",
      relationship: "#7D8BA0",
      root: lv(ROOT, { shape: "rect", fill: "#D9E4F2" }),
      main: lv(MAIN, { shape: "rect" }),
      sub: lv(SUB, { shape: "rect", fill: "#1B2431", borderWidth: 1, padX: 10, padY: 5 }),
      floating: lv(FLOAT, { shape: "rect", fill: "#222C3A" }),
      summary: lv(SUMMARY, { shape: "rect" }),
    }),
  },
  {
    id: "night",
    zh: "暗夜",
    en: "Night",
    light: palette({
      background: "#1B2036",
      text: "#D7DBEA",
      rainbow: NIGHT_RAINBOW,
      relationship: "#8F97B8",
      root: lv(ROOT, { fill: "none", border: "#38BDF8", borderWidth: 2.5, textColor: "#FFFFFF" }),
      main: lv(MAIN, { fill: "none", border: "branch", borderWidth: 2, textColor: "branch" }),
      floating: lv(FLOAT, { fill: "#272D48" }),
    }),
    dark: palette({
      background: "#0F1220",
      text: "#D7DBEA",
      rainbow: NIGHT_RAINBOW,
      relationship: "#8F97B8",
      root: lv(ROOT, { fill: "none", border: "#38BDF8", borderWidth: 2.5, textColor: "#FFFFFF" }),
      main: lv(MAIN, { fill: "none", border: "branch", borderWidth: 2, textColor: "branch" }),
      floating: lv(FLOAT, { fill: "#1C2138" }),
    }),
  },
  {
    id: "sketch",
    zh: "Excalidraw",
    en: "Excalidraw",
    light: palette({
      background: "#ffffff",
      text: "#1e1e1e",
      rainbow: EXCALI_RAINBOW,
      relationship: "#1e1e1e",
      root: lv(ROOT, { fill: "#ffec99", border: "#1e1e1e", borderWidth: 2, textColor: "#1e1e1e" }),
      main: lv(MAIN, { fill: "tint", border: "branch", borderWidth: 2, textColor: "#1e1e1e" }),
      floating: lv(FLOAT, { fill: "#e9ecef", border: "#1e1e1e", borderWidth: 2, textColor: "#1e1e1e" }),
    }),
    dark: palette({
      background: "#121212",
      text: "#e9ecef",
      rainbow: EXCALI_RAINBOW_DARK,
      relationship: "#ced4da",
      root: lv(ROOT, { fill: "#5c4a12", border: "#e9ecef", borderWidth: 2, textColor: "#e9ecef" }),
      main: lv(MAIN, { fill: "tint", border: "branch", borderWidth: 2, textColor: "#e9ecef" }),
      floating: lv(FLOAT, { fill: "#2b2b2b", border: "#ced4da", borderWidth: 2, textColor: "#e9ecef" }),
    }),
  },
  {
    id: "mono",
    zh: "黑白",
    en: "Mono",
    light: palette({
      background: "#FFFFFF",
      text: "#111111",
      rainbow: ["#333333"],
      lineStyle: "straight",
      relationship: "#666666",
      root: lv(ROOT, { shape: "rect", fill: "#111111" }),
      main: lv(MAIN, { fill: "#FFFFFF", border: "#111111", borderWidth: 1.5, textColor: "#111111" }),
      sub: lv(SUB, { border: "#555555" }),
      floating: lv(FLOAT, { fill: "#FFFFFF", border: "#111111", borderWidth: 1 }),
    }),
    dark: palette({
      background: "#111111",
      text: "#E8E8E8",
      rainbow: ["#BBBBBB"],
      lineStyle: "straight",
      relationship: "#999999",
      root: lv(ROOT, { shape: "rect", fill: "#EEEEEE" }),
      main: lv(MAIN, { fill: "#111111", border: "#EEEEEE", borderWidth: 1.5, textColor: "#EEEEEE" }),
      sub: lv(SUB, { border: "#AAAAAA" }),
      floating: lv(FLOAT, { fill: "#111111", border: "#EEEEEE", borderWidth: 1 }),
    }),
  },
];

export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** 分支色的浅色版:Excalidraw 调色板查表,其他颜色与底色混合 */
export function tint(color: string, background: string): string {
  const known = EXCALI_TINTS[color.toLowerCase()];
  if (known && luminance(background) > 0.5) return known;
  return mix(color, background, luminance(background) > 0.5 ? 0.72 : 0.6);
}

function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a);
  const pb = /^#([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const ch = (sh: number) => Math.round(((na >> sh) & 255) * (1 - t) + ((nb >> sh) & 255) * t);
  return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("");
}

export function getPalette(doc: MindDoc, dark: boolean): Palette {
  const t = getTheme(docTheme(doc));
  return dark ? t.dark : t.light;
}

// ---------- 颜色工具 ----------

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** 底色上用黑字还是白字 */
export function contrastText(bg: string): string {
  return luminance(bg) > 0.45 ? "#1F2329" : "#FFFFFF";
}

/** #RRGGBB + 透明度 → rgba() */
export function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------- 样式合并 ----------

function resolveLevel(p: Palette, kind: TopicKind, depth: number, branchColor: string, own: Style | undefined, hasChildren = false, look: Look = "standard", fillDefault: FillStyle = DEFAULT_FILL_STYLE): ResolvedStyle {
  const s = cleanStyle(own);
  // 下划线子主题若还有下级,线会像树枝一样从横线上岔出去,默认改成圆角框
  const base = kind === "sub" && hasChildren && !s.shape && p.sub.shape === "underline"
    ? { ...p.sub, shape: "rounded" as Shape, padX: 10, padY: 6 }
    : p[kind];
  const pick = (v: string) => (v === "branch" ? branchColor : v === "tint" ? tint(branchColor, p.background) : v === "text" ? p.text : v);
  const hand = look === "hand";
  const fillStyle: FillStyle = hand ? ((s.fillStyle as FillStyle | undefined) ?? fillDefault) : "solid";
  const origFill = (s.fill as string | undefined) ?? pick(base.fill);
  let fill = fillStyle === "none" ? "none" : origFill;
  // 斜线、点状等稀疏填充时,文字实际落在画布底色上
  const sparse = fill !== "none" && fillStyle !== "solid";
  const bg = fill === "none" || sparse ? p.background : fill;
  let textColor = (s.textColor as string | undefined) ?? pick(base.textColor);
  if (textColor === "auto") textColor = sparse ? p.text : contrastText(bg);
  let border = (s.border as string | undefined) ?? pick(base.border);
  let borderWidth = s.borderWidth ?? base.borderWidth;
  // Excalidraw 的图形总有描边:没有边框的色块用原底色描边(不填充时也保留这圈描边)
  if (hand && origFill !== "none" && (border === "none" || borderWidth <= 0)) {
    border = origFill;
    borderWidth = 2;
  }
  // 稀疏填充压在文字上,和 Excalidraw 的默认填充一样用同色系浅色;本来就接近底色的不变
  if (sparse && fill.startsWith("#") && Math.abs(luminance(fill) - luminance(p.background)) > 0.3) fill = tint(fill, p.background);
  return {
    kind,
    depth,
    branchColor,
    shape: s.shape ?? base.shape,
    fill,
    border,
    borderWidth,
    textColor,
    fontSize: s.fontSize ?? base.fontSize,
    // Excalifont 没有粗体,手绘时只在用户明确要求时加粗
    bold: s.bold ?? (hand ? false : base.bold),
    italic: s.italic ?? false,
    strike: s.strike ?? false,
    lineColor: (s.lineColor as string | undefined) ?? branchColor,
    lineWidth: s.lineWidth ?? base.lineWidth,
    lineStyle: (s.lineStyle as LineStyle | undefined) ?? p.lineStyle,
    fontFamily: hand ? HAND_FONT : p.fontFamily,
    padX: base.padX,
    padY: base.padY,
    hand,
    fillStyle,
    textAlign: (s.textAlign as TextAlign | undefined) ?? "center",
  };
}

/** 节点自己设置的颜色会成为它这条分支的颜色 */
function ownBranchColor(t: Topic): string | undefined {
  const s = cleanStyle(t.style);
  if (typeof s.lineColor === "string") return s.lineColor;
  if (typeof s.fill === "string" && s.fill !== "none") return s.fill;
  return undefined;
}

/** 计算所有节点(含概括主题,键为概括 id)的最终样式 */
export function resolveAll(doc: MindDoc, dark: boolean): { palette: Palette; styles: Map<string, ResolvedStyle>; look: Look } {
  const look = docLook(doc);
  const fillDefault = docFillStyle(doc);
  const base = getPalette(doc, dark);
  const p = look === "hand" ? { ...base, fontFamily: HAND_FONT } : base;
  const styles = new Map<string, ResolvedStyle>();
  const rb = p.rainbow;
  const visit = (t: Topic, depth: number, branch: string, kind: TopicKind) => {
    const st = resolveLevel(p, kind, depth, branch, t.style, !!t.children?.length, look, fillDefault);
    styles.set(t.id, st);
    const children = t.children ?? [];
    children.forEach((c, i) => {
      // 一级分支各取一个彩虹色;更深的节点沿用父节点连线的颜色
      const cb = kind === "root" ? (ownBranchColor(c) ?? rb[i % rb.length]) : st.lineColor;
      visit(c, depth + 1, cb, kind === "root" ? "main" : "sub");
    });
    for (const s of t.summaries ?? []) {
      const from = children.find((c) => c.id === s.from);
      const sb = (from && styles.get(from.id)?.branchColor) ?? branch;
      styles.set(s.id, resolveLevel(p, "summary", depth + 1, sb, s.style, false, look, fillDefault));
    }
  };
  // 中心主题的连线颜色由各分支决定
  visit(doc.root, 0, p.text, "root");
  const n = doc.root.children?.length ?? 0;
  (doc.floating ?? []).forEach((f, i) => {
    const color = ownBranchColor(f) ?? rb[(n + i) % rb.length];
    visit(f, 0, color, "floating");
  });
  return { palette: p, styles, look };
}

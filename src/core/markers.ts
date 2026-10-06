// 标记:id 形如「类别-值」,同一类别在一个节点上最多一个

export interface MarkerDef {
  id: string;
  category: string;
  /** 渲染用:徽标底色 */
  color: string;
  /** 渲染用:徽标内文字 / 符号 */
  glyph: string;
  /** 任务进度 0-100(仅 task 类) */
  progress?: number;
}

export interface MarkerCategory {
  id: string;
  zh: string;
  en: string;
  markers: MarkerDef[];
}

const PRIORITY_COLORS = ["#E5484D", "#F76B15", "#F5B400", "#30A46C", "#0090FF", "#6E56CF", "#8E8C99", "#8E8C99", "#8E8C99"];
const COLORS: Record<string, string> = {
  red: "#E5484D",
  orange: "#F76B15",
  yellow: "#F5B400",
  green: "#30A46C",
  blue: "#0090FF",
  purple: "#8E4EC6",
};

export const MARKER_CATEGORIES: MarkerCategory[] = [
  {
    id: "priority",
    zh: "优先级",
    en: "Priority",
    markers: PRIORITY_COLORS.map((color, i) => ({ id: `priority-${i + 1}`, category: "priority", color, glyph: String(i + 1) })),
  },
  {
    id: "task",
    zh: "任务进度",
    en: "Task",
    markers: [0, 25, 50, 75, 100].map((p) => ({ id: `task-${p}`, category: "task", color: "#30A46C", glyph: p === 100 ? "✓" : "", progress: p })),
  },
  {
    id: "flag",
    zh: "旗帜",
    en: "Flag",
    markers: Object.entries(COLORS).map(([k, color]) => ({ id: `flag-${k}`, category: "flag", color, glyph: "⚑" })),
  },
  {
    id: "star",
    zh: "星星",
    en: "Star",
    markers: Object.entries(COLORS).map(([k, color]) => ({ id: `star-${k}`, category: "star", color, glyph: "★" })),
  },
  {
    id: "smiley",
    zh: "表情",
    en: "Smiley",
    markers: [
      ["happy", "☺"],
      ["laugh", "😄"],
      ["sad", "☹"],
      ["angry", "😠"],
      ["surprised", "😮"],
    ].map(([k, glyph]) => ({ id: `smiley-${k}`, category: "smiley", color: "#F5B400", glyph })),
  },
  {
    id: "symbol",
    zh: "符号",
    en: "Symbol",
    markers: [
      ["question", "?", "#0090FF"],
      ["exclamation", "!", "#E5484D"],
      ["check", "✓", "#30A46C"],
      ["cross", "✕", "#E5484D"],
      ["idea", "💡", "#F5B400"],
    ].map(([k, glyph, color]) => ({ id: `symbol-${k}`, category: "symbol", color, glyph })),
  },
];

const BY_ID = new Map<string, MarkerDef>();
for (const c of MARKER_CATEGORIES) for (const m of c.markers) BY_ID.set(m.id, m);

export function markerDef(id: string): MarkerDef | undefined {
  return BY_ID.get(id);
}

export function markerCategory(id: string): string {
  const i = id.lastIndexOf("-");
  return i > 0 ? id.slice(0, i) : id;
}

export const ALL_MARKER_IDS = [...BY_ID.keys()];

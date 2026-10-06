export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 节点尺寸(由界面测量);underline 表示连线接在节点底边(下划线样式) */
export interface NodeSize {
  w: number;
  h: number;
  underline?: boolean;
}

/** 子节点的排列方向:h = 水平(左右),v = 向下(组织结构图),tree = 向下缩进(树形图) */
export type Orient = "h" | "v" | "tree";
export type Dir = 1 | -1;

export interface NodeBox extends Rect {
  id: string;
  kind: "topic" | "summary";
  depth: number;
  parentId?: string;
  /** 子节点排列方式与方向,决定折叠按钮的位置 */
  orient: Orient;
  dir: Dir;
  /** 连向子节点的线的起点 */
  outX: number;
  outY: number;
  /** 自由主题的根 */
  floatingRoot?: boolean;
}

export interface Edge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orient: Orient;
  /** 从中心主题出发的线(画成由粗到细) */
  fromRoot: boolean;
}

/** 概括的大括号:span 是被概括的范围,括号画在 span 的外侧 */
export interface SummaryGeo {
  id: string;
  ownerId: string;
  side: "right" | "left" | "down";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BoundaryGeo extends Rect {
  id: string;
  ownerId: string;
}

export interface LayoutResult {
  nodes: Map<string, NodeBox>;
  edges: Edge[];
  summaries: SummaryGeo[];
  boundaries: BoundaryGeo[];
  bounds: Rect;
}

// .wmind 文件格式的类型定义。字段说明见 docs/superpowers/specs 与 skills/weilanx-mind-map/references/format.md

export type Structure = "map" | "logic" | "org" | "tree";
export const STRUCTURES: Structure[] = ["map", "logic", "org", "tree"];

export type Shape = "rect" | "rounded" | "capsule" | "ellipse" | "underline" | "none";
export const SHAPES: Shape[] = ["rect", "rounded", "capsule", "ellipse", "underline", "none"];

export type LineStyle = "curve" | "straight" | "elbow";
export const LINE_STYLES: LineStyle[] = ["curve", "straight", "elbow"];

export interface Point {
  x: number;
  y: number;
}

/** 节点样式:只写与主题默认值不同的键 */
export interface Style {
  fill?: string;
  border?: string;
  borderWidth?: number;
  shape?: Shape;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  lineColor?: string;
  lineWidth?: number;
  /** 节点连向子节点的线;联系线另支持 dashed / solid */
  lineStyle?: LineStyle | "dashed" | "solid";
  [key: string]: unknown;
}

/** 概括 / 外框:作用于某个节点从 from 到 to 的一段直接子节点 */
export interface Range {
  id: string;
  from: string;
  to: string;
  text?: string;
  style?: Style;
  [key: string]: unknown;
}

export interface Topic {
  id: string;
  text: string;
  collapsed?: boolean;
  structure?: Structure;
  /** 仅自由主题:相对中心主题中心点的坐标(自由主题左上角) */
  position?: Point;
  style?: Style;
  markers?: string[];
  labels?: string[];
  note?: string;
  link?: string;
  summaries?: Range[];
  boundaries?: Range[];
  children?: Topic[];
  [key: string]: unknown;
}

export interface Relationship {
  id: string;
  from: string;
  to: string;
  text?: string;
  /** 两个控制点,分别相对 from / to 节点中心的偏移 */
  controls?: [Point, Point];
  style?: Style;
  [key: string]: unknown;
}

export interface MindDoc {
  $schema?: string;
  version: number;
  theme?: string;
  structure?: Structure;
  root: Topic;
  relationships?: Relationship[];
  floating?: Topic[];
  [key: string]: unknown;
}

export const FORMAT_VERSION = 1;
export const DEFAULT_THEME = "classic";
export const DEFAULT_STRUCTURE: Structure = "map";

/** 解析 / 校验发现的问题 */
export interface Issue {
  level: "warn" | "error";
  message: string;
  /** 相关对象 id */
  id?: string;
}

// 文档 → 可渲染的场景:最终样式、节点尺寸、布局
import { resolveAll, type Palette, type ResolvedStyle } from "../../src/core/theme";
import { layout, type LayoutResult, type NodeSize } from "../../src/core/layout";
import type { Look, MindDoc, Range, Topic } from "../../src/core/types";
import { measure, type Metrics } from "./measure";
import { t } from "./i18n";

export interface Scene {
  palette: Palette;
  look: Look;
  styles: Map<string, ResolvedStyle>;
  metrics: Map<string, Metrics>;
  layout: LayoutResult;
  /** id → 节点或概括数据 */
  topics: Map<string, Topic>;
  ranges: Map<string, { owner: Topic; kind: "summaries" | "boundaries"; range: Range }>;
}

export function buildScene(doc: MindDoc, dark: boolean): Scene {
  const { palette, styles, look } = resolveAll(doc, dark);
  const metrics = new Map<string, Metrics>();
  const sizes = new Map<string, NodeSize>();
  const topics = new Map<string, Topic>();
  const ranges: Scene["ranges"] = new Map();
  const visit = (tp: Topic) => {
    topics.set(tp.id, tp);
    const st = styles.get(tp.id)!;
    const placeholder = t("emptyText");
    const m = measure(tp, tp, st, placeholder);
    metrics.set(tp.id, m);
    sizes.set(tp.id, m);
    for (const s of tp.summaries ?? []) {
      ranges.set(s.id, { owner: tp, kind: "summaries", range: s });
      const ss = styles.get(s.id);
      if (!ss) continue;
      const sm = measure(s, { text: s.text ?? "" }, ss, t("newSummary"));
      metrics.set(s.id, sm);
      sizes.set(s.id, sm);
    }
    for (const b of tp.boundaries ?? []) ranges.set(b.id, { owner: tp, kind: "boundaries", range: b });
    if (!tp.collapsed) for (const c of tp.children ?? []) visit(c);
    else for (const c of tp.children ?? []) collect(c);
  };
  // 折叠分支里的节点不排版,但仍登记,方便查找
  const collect = (tp: Topic) => {
    topics.set(tp.id, tp);
    for (const c of tp.children ?? []) collect(c);
  };
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  return { palette, look, styles, metrics, layout: layout(doc, sizes), topics, ranges };
}

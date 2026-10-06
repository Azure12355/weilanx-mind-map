import { useEffect, useRef, useState, type ReactNode } from "react";
import * as ops from "../../src/core/ops";
import { getTopic, countDescendants } from "../../src/core/query";
import { getTheme, THEMES, type ResolvedStyle } from "../../src/core/theme";
import { MARKER_CATEGORIES, markerDef } from "../../src/core/markers";
import { rootStructure } from "../../src/core/layout";
import { docTheme, cleanStyle } from "../../src/core/doc";
import type { LineStyle, MindDoc, Shape, Structure, Style } from "../../src/core/types";
import type { Actions } from "./App";
import type { Scene } from "./scene";
import { Icon } from "./icons";
import { langIsZh, t } from "./i18n";
import { shapePath } from "./TopicNode";

const SWATCHES = [
  "#F0604D", "#F5A623", "#F8D74A", "#3DB47A", "#2FB8AC", "#2F9BEA", "#7C63F2", "#E3578F", "#8E8C99", "#1F2D3D",
  "#FDE2DE", "#FDEBC8", "#FFF6C9", "#D7F0E2", "#D3F1EE", "#D6EAFB", "#E5E0FD", "#FBDDE9", "#EEEEF0", "#FFFFFF",
];
const SHAPES: Shape[] = ["rounded", "rect", "capsule", "ellipse", "underline", "none"];
const FONT_SIZES = [10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const LINE_STYLES: LineStyle[] = ["curve", "straight", "elbow"];

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="wm-sec">
      <div className="wm-sec-title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 颜色选择:色块 + 自定义 + 无 / 默认 */
function Colors({ value, onChange, allowNone }: { value: string | undefined; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="wm-colors">
      <button className={"wm-chip wm-chip-text" + (value === undefined ? " wm-active" : "")} onClick={() => onChange(undefined)} title={t("default")}>
        {t("default")}
      </button>
      {allowNone && (
        <button className={"wm-swatch wm-swatch-none" + (value === "none" ? " wm-active" : "")} onClick={() => onChange("none")} title={t("none")} />
      )}
      {SWATCHES.map((c) => (
        <button key={c} className={"wm-swatch" + (value?.toUpperCase() === c ? " wm-active" : "")} style={{ background: c }} onClick={() => onChange(c)} title={c} />
      ))}
      <label className="wm-swatch wm-swatch-custom" title="#RRGGBB">
        <input type="color" value={value && value.startsWith("#") ? value : "#888888"} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T | undefined; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="wm-seg wm-seg-full">
      {options.map((o) => (
        <button key={String(o.v)} className={value === o.v ? "wm-active" : ""} onClick={() => onChange(o.v)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StructureIcon({ s }: { s: Structure }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" } as const;
  return (
    <svg width="44" height="30" viewBox="0 0 44 30">
      {s === "map" && (
        <>
          <rect x="16" y="12" width="12" height="6" rx="2" fill="currentColor" />
          <path d="M28 15C33 15 33 6 40 6M28 15C33 15 33 24 40 24M16 15C11 15 11 6 4 6M16 15C11 15 11 24 4 24" {...p} />
        </>
      )}
      {s === "logic" && (
        <>
          <rect x="3" y="12" width="12" height="6" rx="2" fill="currentColor" />
          <path d="M15 15C21 15 21 5 27 5H40M15 15H40M15 15C21 15 21 25 27 25H40" {...p} />
        </>
      )}
      {s === "org" && (
        <>
          <rect x="16" y="3" width="12" height="6" rx="2" fill="currentColor" />
          <path d="M22 9V15M8 15H36M8 15V21M22 15V21M36 15V21" {...p} />
          <rect x="4" y="21" width="8" height="5" rx="1.5" {...p} />
          <rect x="18" y="21" width="8" height="5" rx="1.5" {...p} />
          <rect x="32" y="21" width="8" height="5" rx="1.5" {...p} />
        </>
      )}
      {s === "tree" && (
        <>
          <rect x="4" y="2" width="12" height="6" rx="2" fill="currentColor" />
          <path d="M9 8V25M9 14H18M9 25H18" {...p} />
          <rect x="18" y="11" width="18" height="6" rx="1.5" {...p} />
          <rect x="18" y="22" width="18" height="6" rx="1.5" {...p} />
        </>
      )}
    </svg>
  );
}

export function ThemeSwatch({ id, dark }: { id: string; dark: boolean }) {
  const th = getTheme(id);
  const p = dark ? th.dark : th.light;
  const pick = (v: string, i: number) => (v === "branch" ? p.rainbow[i % p.rainbow.length] : v === "none" ? "transparent" : v);
  const root = p.root.fill === "none" ? "transparent" : p.root.fill;
  return (
    <svg width="64" height="40" viewBox="0 0 64 40">
      <rect width="64" height="40" rx="5" fill={p.background} />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M32 20 C42 20 40 ${8 + i * 12} 48 ${8 + i * 12}`} fill="none" stroke={p.rainbow[i % p.rainbow.length]} strokeWidth="1.6" />
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x="48" y={5 + i * 12} width="12" height="6" rx="2" fill={pick(p.main.fill, i)} stroke={p.main.border === "none" ? "none" : pick(p.main.border, i)} />
      ))}
      <rect x="18" y="15" width="22" height="10" rx="3" fill={root} stroke={p.root.border === "none" ? "none" : p.root.border} />
    </svg>
  );
}

function ShapeIcon({ shape }: { shape: Shape }) {
  if (shape === "underline")
    return (
      <svg width="30" height="18" viewBox="0 0 30 18">
        <path d="M3 15H27" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (shape === "none")
    return (
      <svg width="30" height="18" viewBox="0 0 30 18">
        <text x="15" y="13" textAnchor="middle" fontSize="10" fill="currentColor">
          Aa
        </text>
      </svg>
    );
  return (
    <svg width="30" height="18" viewBox="-1 -1 30 18">
      <path d={shapePath(shape, 28, 16)} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 失焦或回车时才提交的输入框,避免每个字符都进撤销栈 */
function Field({ value, placeholder, onCommit, multiline, focusKey }: { value: string; placeholder?: string; onCommit: (v: string) => void; multiline?: boolean; focusKey?: number }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    ref,
    className: "wm-input",
    value: draft,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement & HTMLInputElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") setDraft(value);
    },
  };
  return multiline ? <textarea rows={4} {...common} /> : <input {...common} />;
}

type Kind = "topic" | "summary" | "boundary" | "rel";

function kindOf(doc: MindDoc, id: string): Kind | null {
  if (getTopic(doc, id)) return "topic";
  const r = ops.findRange(doc, id);
  if (r) return r.kind === "summaries" ? "summary" : "boundary";
  if (doc.relationships?.some((x) => x.id === id)) return "rel";
  return null;
}

export function FormatPanel({ actions: a, scene, focus, onClose }: { actions: Actions; scene: Scene; focus: { field: "note" | "link"; n: number } | null; onClose: () => void }) {
  const doc = a.doc;
  const ids = a.selection.filter((id) => kindOf(doc, id));
  const kind = ids.length ? kindOf(doc, ids[0]) : null;
  const [tab, setTab] = useState<"style" | "canvas">("style");
  // 选中对象变化时回到「样式」页
  const selKey = ids.join(",");
  useEffect(() => setTab("style"), [selKey]);
  const showStyle = !!kind && tab === "style";
  return (
    <aside className="wm-panel">
      <div className="wm-panel-head">
        <div className="wm-tabs">
          <button className={showStyle ? "wm-active" : ""} disabled={!kind} onClick={() => setTab("style")}>
            {t("style")}
          </button>
          <button className={!showStyle ? "wm-active" : ""} onClick={() => setTab("canvas")}>
            {t("canvas")}
          </button>
        </div>
        <button className="wm-icon-btn" onClick={onClose} title={t("hide")}>
          <Icon.close />
        </button>
      </div>
      <div className="wm-panel-body">
        {showStyle && kind === "topic" && <TopicStyle a={a} scene={scene} ids={ids.filter((id) => kindOf(doc, id) === "topic")} focus={focus} />}
        {showStyle && kind === "summary" && <RangeStyle a={a} id={ids[0]} summary />}
        {showStyle && kind === "boundary" && <RangeStyle a={a} id={ids[0]} />}
        {showStyle && kind === "rel" && <RelStyle a={a} id={ids[0]} />}
        {!showStyle && <CanvasTab a={a} />}
      </div>
    </aside>
  );
}

function TopicStyle({ a, scene, ids, focus }: { a: Actions; scene: Scene; ids: string[]; focus: { field: "note" | "link"; n: number } | null }) {
  const doc = a.doc;
  const first = getTopic(doc, ids[0])!;
  const own = cleanStyle(first.style);
  const rs: ResolvedStyle | undefined = scene.styles.get(first.id);
  const set = (patch: Style) => a.apply((d) => ops.setStyle(d, ids, patch));
  const [labelDraft, setLabelDraft] = useState("");
  const isRoot = ids.length === 1 && ids[0] === doc.root.id;
  const branchStructure = first.structure;
  const ro = a.readOnly;
  const one = ids.length === 1;
  return (
    <fieldset disabled={ro} className="wm-fieldset">
      {ids.length > 1 && <div className="wm-sel-count">{t("selectionTitle", ids.length)}</div>}
      {!isRoot && (
        <Section title={t("structure")}>
          <select
            className="wm-select"
            value={branchStructure ?? ""}
            onChange={(e) => a.apply((d) => ops.updateTopic(d, ids, { structure: (e.target.value || undefined) as Structure | undefined }))}
          >
            <option value="">{t("structure.inherit")}</option>
            <option value="logic">{t("structure.logic")}</option>
            <option value="org">{t("structure.org")}</option>
            <option value="tree">{t("structure.tree")}</option>
          </select>
        </Section>
      )}
      <Section title={t("shape")}>
        <div className="wm-shapes">
          {SHAPES.map((s) => (
            <button key={s} className={"wm-shape" + (rs?.shape === s ? " wm-active" : "") + (own.shape === s ? " wm-own" : "")} title={t(`shape.${s}`)} onClick={() => set({ shape: own.shape === s ? undefined : s })}>
              <ShapeIcon shape={s} />
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("fill")}>
        <Colors value={own.fill as string | undefined} onChange={(v) => set({ fill: v })} allowNone />
      </Section>
      <Section title={t("border")}>
        <Colors value={own.border as string | undefined} onChange={(v) => set({ border: v, borderWidth: v && v !== "none" && !rs?.borderWidth ? 1.5 : own.borderWidth })} allowNone />
        <div className="wm-row">
          <span className="wm-row-label">{t("width")}</span>
          <select className="wm-select" value={own.borderWidth ?? ""} onChange={(e) => set({ borderWidth: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">{t("default")}</option>
            {[0, 1, 1.5, 2, 3, 4, 6].map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </div>
      </Section>
      <Section title={t("text")}>
        <div className="wm-row">
          <select className="wm-select" value={own.fontSize ?? ""} onChange={(e) => set({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">
              {t("default")} ({rs?.fontSize})
            </option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="wm-seg">
            <button className={rs?.bold ? "wm-active" : ""} onClick={() => set({ bold: !rs?.bold })} title="Bold">
              <b>B</b>
            </button>
            <button className={rs?.italic ? "wm-active" : ""} onClick={() => set({ italic: rs?.italic ? undefined : true })} title="Italic">
              <i>I</i>
            </button>
            <button className={rs?.strike ? "wm-active" : ""} onClick={() => set({ strike: rs?.strike ? undefined : true })} title="Strike">
              <s>S</s>
            </button>
          </div>
        </div>
        <Colors value={own.textColor as string | undefined} onChange={(v) => set({ textColor: v })} />
      </Section>
      <Section title={t("line")}>
        <Colors value={own.lineColor as string | undefined} onChange={(v) => set({ lineColor: v })} />
        <div className="wm-row">
          <Seg<LineStyle> value={own.lineStyle as LineStyle | undefined} options={LINE_STYLES.map((s) => ({ v: s, label: t(`line.${s}`) }))} onChange={(v) => set({ lineStyle: own.lineStyle === v ? undefined : v })} />
        </div>
        <div className="wm-row">
          <span className="wm-row-label">{t("width")}</span>
          <select className="wm-select" value={own.lineWidth ?? ""} onChange={(e) => set({ lineWidth: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">{t("default")}</option>
            {[1, 1.5, 2, 3, 4, 6, 8].map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </div>
      </Section>
      <button className="wm-btn wm-btn-block" onClick={() => a.apply((d) => ops.clearStyle(d, ids))}>
        {t("resetStyle")}
      </button>
      <Section title={t("marker")}>
        {MARKER_CATEGORIES.map((c) => (
          <div key={c.id} className="wm-marker-row">
            <span className="wm-row-label">{langIsZh() ? c.zh : c.en}</span>
            <div className="wm-markers">
              {c.markers.map((m) => {
                const on = ids.every((id) => getTopic(doc, id)?.markers?.includes(m.id));
                return (
                  <button key={m.id} className={"wm-marker" + (on ? " wm-active" : "")} title={m.id} onClick={() => a.apply((d) => ops.toggleMarker(d, ids, m.id))}>
                    <MarkerPreview id={m.id} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Section>
      <Section title={t("label")}>
        <div className="wm-labels">
          {[...new Set(ids.flatMap((id) => getTopic(doc, id)?.labels ?? []))].map((l) => (
            <span key={l} className="wm-label-chip">
              {l}
              <button onClick={() => a.apply((d) => ops.removeLabel(d, ids, l))}>×</button>
            </span>
          ))}
        </div>
        <input
          className="wm-input"
          placeholder={t("addLabel")}
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && labelDraft.trim()) {
              a.apply((d) => ops.addLabel(d, ids, labelDraft));
              setLabelDraft("");
            }
          }}
        />
      </Section>
      {one && (
        <>
          <Section title={t("note")}>
            <Field multiline value={first.note ?? ""} placeholder={t("notePlaceholder")} focusKey={focus?.field === "note" ? focus.n : undefined} onCommit={(v) => a.apply((d) => ops.updateTopic(d, first.id, { note: v.trim() ? v : undefined }))} />
          </Section>
          <Section
            title={t("link")}
            action={
              first.link ? (
                <button className="wm-icon-btn" title={t("openLink")} onClick={() => a.openLink(first.id)}>
                  <Icon.open />
                </button>
              ) : undefined
            }
          >
            <Field value={first.link ?? ""} placeholder={t("linkPlaceholder")} onCommit={(v) => a.apply((d) => ops.updateTopic(d, first.id, { link: v.trim() ? v.trim() : undefined }))} />
          </Section>
        </>
      )}
    </fieldset>
  );
}

function MarkerPreview({ id }: { id: string }) {
  // 复用画布上的标记绘制
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <MarkerGlyph id={id} />
    </svg>
  );
}

function MarkerGlyph({ id }: { id: string }) {
  const d = markerDef(id)!;
  if (d.category === "task") {
    const p = d.progress ?? 0;
    const a = (p / 100) * Math.PI * 2;
    return (
      <g>
        <circle cx={10} cy={10} r={8.5} fill={p === 100 ? d.color : "#fff"} stroke={d.color} strokeWidth={1.5} />
        {p > 0 && p < 100 && <path d={`M10,10 L10,3 A7,7 0 ${p > 50 ? 1 : 0} 1 ${10 + 7 * Math.sin(a)},${10 - 7 * Math.cos(a)} Z`} fill={d.color} />}
        {p === 100 && <path d="M6,10.5 L9,13 L14,7" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />}
      </g>
    );
  }
  if (d.category === "flag" || d.category === "star")
    return (
      <text x={10} y={10} dy="0.36em" textAnchor="middle" fontSize={18} fill={d.color}>
        {d.glyph}
      </text>
    );
  if (d.category === "smiley" || d.id === "symbol-idea")
    return (
      <text x={10} y={10} dy="0.36em" textAnchor="middle" fontSize={15}>
        {d.glyph}
      </text>
    );
  return (
    <g>
      <circle cx={10} cy={10} r={9} fill={d.color} />
      <text x={10} y={10} dy="0.36em" textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
        {d.glyph}
      </text>
    </g>
  );
}

function RangeStyle({ a, id, summary }: { a: Actions; id: string; summary?: boolean }) {
  const f = ops.findRange(a.doc, id);
  if (!f) return null;
  const own = cleanStyle(f.range.style);
  const set = (patch: Style) => a.apply((d) => ops.setRangeStyle(d, id, patch));
  return (
    <fieldset disabled={a.readOnly} className="wm-fieldset">
      <Section title={summary ? t("summaryText") : t("boundaryText")}>
        <Field value={f.range.text ?? ""} onCommit={(v) => a.apply((d) => ops.updateRange(d, id, { text: v.trim() ? v : undefined }))} />
      </Section>
      <Section title={summary ? t("border") : t("color")}>
        <Colors value={own.border as string | undefined} onChange={(v) => set({ border: v })} allowNone={summary} />
      </Section>
      <Section title={t("fill")}>
        <Colors value={own.fill as string | undefined} onChange={(v) => set({ fill: v })} allowNone />
      </Section>
      {summary && (
        <Section title={t("text")}>
          <Colors value={own.textColor as string | undefined} onChange={(v) => set({ textColor: v })} />
        </Section>
      )}
      <button className="wm-btn wm-btn-block wm-btn-danger" onClick={() => a.apply((d) => ops.removeRange(d, id), [f.owner.id])}>
        <Icon.trash /> {t("remove")}
      </button>
    </fieldset>
  );
}

function RelStyle({ a, id }: { a: Actions; id: string }) {
  const r = a.doc.relationships?.find((x) => x.id === id);
  if (!r) return null;
  const own = cleanStyle(r.style, true);
  const set = (patch: Style) => a.apply((d) => ops.setRelationshipStyle(d, id, patch));
  return (
    <fieldset disabled={a.readOnly} className="wm-fieldset">
      <Section title={t("relText")}>
        <Field value={r.text ?? ""} onCommit={(v) => a.apply((d) => ops.updateRelationship(d, id, { text: v.trim() ? v : undefined }))} />
      </Section>
      <Section title={t("color")}>
        <Colors value={own.lineColor as string | undefined} onChange={(v) => set({ lineColor: v })} />
      </Section>
      <Section title={t("lineStyle")}>
        <Seg<string>
          value={(own.lineStyle as string | undefined) ?? "dashed"}
          options={[
            { v: "dashed", label: t("line.dashed") },
            { v: "solid", label: t("line.solid") },
          ]}
          onChange={(v) => set({ lineStyle: v === "dashed" ? undefined : (v as "solid") })}
        />
        <div className="wm-row">
          <span className="wm-row-label">{t("width")}</span>
          <select className="wm-select" value={own.lineWidth ?? ""} onChange={(e) => set({ lineWidth: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">{t("default")}</option>
            {[1, 1.5, 2, 3, 4].map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </div>
      </Section>
      <button className="wm-btn wm-btn-block" onClick={() => a.apply((d) => ops.updateRelationship(d, id, { controls: undefined }))}>
        {t("resetStyle")}
      </button>
      <button className="wm-btn wm-btn-block wm-btn-danger" onClick={() => a.apply((d) => ops.removeRelationship(d, id), [])}>
        <Icon.trash /> {t("remove")}
      </button>
    </fieldset>
  );
}

function CanvasTab({ a }: { a: Actions }) {
  const doc = a.doc;
  const theme = docTheme(doc);
  const st = rootStructure(doc);
  const total = countDescendants(doc.root) + 1 + (doc.floating ?? []).reduce((n, f) => n + 1 + countDescendants(f), 0);
  return (
    <fieldset disabled={a.readOnly} className="wm-fieldset">
      <Section title={t("theme")}>
        <div className="wm-theme-grid wm-theme-grid-panel">
          {THEMES.map((th) => (
            <button key={th.id} className={"wm-card" + (th.id === theme ? " wm-active" : "")} onClick={() => a.apply((d) => ops.setDocProp(d, "theme", th.id))}>
              <ThemeSwatch id={th.id} dark={a.dark} />
              <span>{langIsZh() ? th.zh : th.en}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("structure")}>
        <div className="wm-struct-grid wm-struct-grid-panel">
          {(["map", "logic", "org", "tree"] as Structure[]).map((s) => (
            <button key={s} className={"wm-card" + (s === st ? " wm-active" : "")} onClick={() => a.apply((d) => ops.setDocProp({ ...d, root: { ...d.root, structure: undefined } }, "structure", s))}>
              <StructureIcon s={s} />
              <span>{t(`structure.${s}`)}</span>
            </button>
          ))}
        </div>
      </Section>
      <div className="wm-row">
        <button className="wm-btn" onClick={() => a.apply((d) => ops.setAllCollapsed(d, false, 0))}>
          {t("expandAll")}
        </button>
        <button className="wm-btn" onClick={() => a.apply((d) => ops.setAllCollapsed(d, true, 1))}>
          {t("collapseAll")}
        </button>
      </div>
      <p className="wm-stats">{langIsZh() ? `共 ${total} 个主题` : `${total} topics`}</p>
    </fieldset>
  );
}

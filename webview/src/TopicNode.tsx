import { memo } from "react";
import type { NodeBox } from "../../src/core/layout";
import { markerDef } from "../../src/core/markers";
import { SELECTION_COLOR, withAlpha, type ResolvedStyle } from "../../src/core/theme";
import type { Shape } from "../../src/core/types";
import { ICON_SIZE, LABEL_FONT_SIZE, LABEL_HEIGHT, type Content, type Metrics } from "./measure";

export function shapePath(shape: Shape, w: number, h: number, root = false): string {
  switch (shape) {
    case "rect":
      return `M0,0 H${w} V${h} H0 Z`;
    case "capsule": {
      const r = h / 2;
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 ${r},0 Z`;
    }
    case "ellipse":
      return `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2} Z`;
    case "rounded":
    default: {
      const r = Math.min(root ? 10 : 7, h / 3);
      return `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;
    }
  }
}

function Marker({ id, x, y, size }: { id: string; x: number; y: number; size: number }) {
  const def = markerDef(id);
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  if (!def) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="#8E8C99" />
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={size * 0.65} fill="#fff" fontWeight={700} fontFamily="sans-serif">
          ?
        </text>
      </g>
    );
  }
  if (def.category === "task") {
    const p = def.progress ?? 0;
    const a = (p / 100) * Math.PI * 2;
    const ir = r - 2.5;
    const ex = cx + ir * Math.sin(a);
    const ey = cy - ir * Math.cos(a);
    return (
      <g>
        <circle cx={cx} cy={cy} r={r - 0.75} fill={p === 100 ? def.color : "#fff"} stroke={def.color} strokeWidth={1.5} />
        {p > 0 && p < 100 && <path d={`M${cx},${cy} L${cx},${cy - ir} A${ir},${ir} 0 ${p > 50 ? 1 : 0} 1 ${ex},${ey} Z`} fill={def.color} />}
        {p === 100 && (
          <path d={`M${cx - r * 0.45},${cy + 0.5} L${cx - r * 0.1},${cy + r * 0.38} L${cx + r * 0.48},${cy - r * 0.35}`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </g>
    );
  }
  if (def.category === "flag" || def.category === "star") {
    return (
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={size * 1.02} fill={def.color} fontFamily="sans-serif">
        {def.glyph}
      </text>
    );
  }
  if (def.category === "smiley" || def.id === "symbol-idea") {
    return (
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={size * 0.9} fontFamily="sans-serif">
        {def.glyph}
      </text>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={def.color} />
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={size * 0.62} fill="#fff" fontWeight={700} fontFamily="sans-serif">
        {def.glyph}
      </text>
    </g>
  );
}

function NoteIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`} data-kind="note-icon">
      <rect x={1.5} y={0.5} width={11} height={13} rx={2} fill="none" stroke={color} strokeWidth={1.3} />
      <path d="M4,4.5 H10 M4,7.5 H10 M4,10.5 H8" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

function LinkIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`} data-kind="link-icon">
      <rect x={0} y={0} width={14} height={14} fill="transparent" />
      <path
        d="M6,8 a2.6,2.6 0 0 0 3.7,0 l2.2,-2.2 a2.6,2.6 0 0 0 -3.7,-3.7 l-0.9,0.9 M8,6 a2.6,2.6 0 0 0 -3.7,0 l-2.2,2.2 a2.6,2.6 0 0 0 3.7,3.7 l0.9,-0.9"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  );
}

export interface FoldInfo {
  collapsed: boolean;
  count: number;
}

interface Props {
  box: NodeBox;
  style: ResolvedStyle;
  m: Metrics;
  content: Content;
  selected: boolean;
  dropTarget?: boolean;
  fold?: FoldInfo;
  ghost?: boolean;
  background: string;
}

function foldPos(box: NodeBox): { x: number; y: number } {
  const lx = box.outX - box.x;
  const ly = box.outY - box.y;
  if (box.orient === "h") return { x: box.dir === 1 ? box.w + 9 : -9, y: ly };
  return { x: lx, y: box.h + 9 };
}

export const TopicNode = memo(function TopicNode({ box, style: s, m, content, selected, dropTarget, fold, ghost, background }: Props) {
  const { w, h } = box;
  const fill = s.fill === "none" ? "transparent" : s.fill;
  const hasBorder = s.border !== "none" && s.borderWidth > 0;
  const iconColor = withAlpha(s.textColor.startsWith("#") ? s.textColor : "#888888", 0.75) as string;
  const fp = fold ? foldPos(box) : null;
  const linkX = m.iconsX + (content.note ? ICON_SIZE + 4 : 0);
  return (
    <g
      className={"wm-topic" + (ghost ? " wm-ghost" : "")}
      transform={`translate(${box.x},${box.y})`}
      data-kind={box.kind === "summary" ? "summary" : "topic"}
      data-id={box.id}
    >
      {s.shape === "underline" ? (
        <>
          <rect x={0} y={0} width={w} height={h} fill={fill} />
          {hasBorder && <line x1={0} y1={h - s.borderWidth / 2} x2={w} y2={h - s.borderWidth / 2} stroke={s.border} strokeWidth={s.borderWidth} strokeLinecap="round" />}
        </>
      ) : s.shape === "none" ? (
        <rect x={0} y={0} width={w} height={h} fill={fill} />
      ) : (
        <path d={shapePath(s.shape, w, h, s.kind === "root")} fill={fill} stroke={hasBorder ? s.border : "none"} strokeWidth={hasBorder ? s.borderWidth : 0} />
      )}
      {(content.markers ?? []).map((id, i) => (
        <Marker key={id + i} id={id} x={m.markersX + i * (m.markerSize + 3)} y={m.markersY} size={m.markerSize} />
      ))}
      <text
        fontFamily={s.fontFamily}
        fontSize={s.fontSize}
        fontWeight={s.bold ? 600 : 400}
        fontStyle={s.italic ? "italic" : undefined}
        textDecoration={s.strike ? "line-through" : undefined}
        fill={content.text ? s.textColor : withAlpha(s.textColor, 0.45)}
        style={{ whiteSpace: "pre" }}
      >
        {m.lines.map((line, i) => (
          <tspan key={i} x={m.textX + m.textW / 2} y={m.textY + i * m.lineHeight + m.lineHeight / 2} dy="0.35em" textAnchor="middle">
            {line || " "}
          </tspan>
        ))}
      </text>
      {content.note && <NoteIcon x={m.iconsX} y={m.iconsY} color={iconColor} />}
      {content.link && <LinkIcon x={linkX} y={m.iconsY} color={iconColor} />}
      {(content.labels ?? []).map((l, i) => {
        const x = m.labelsX + m.labelWidths.slice(0, i).reduce((a, b) => a + b + 4, 0);
        return (
          <g key={l + i}>
            <rect x={x} y={m.labelsY} width={m.labelWidths[i]} height={LABEL_HEIGHT} rx={LABEL_HEIGHT / 2} fill={withAlpha(s.branchColor, 0.16)} />
            <text x={x + m.labelWidths[i] / 2} y={m.labelsY + LABEL_HEIGHT / 2} dy="0.35em" textAnchor="middle" fontSize={LABEL_FONT_SIZE} fontWeight={500} fontFamily={s.fontFamily} fill={s.kind === "main" || s.kind === "root" ? s.textColor : s.branchColor}>
              {l}
            </text>
          </g>
        );
      })}
      <rect className="wm-ui wm-hover" x={-4} y={-4} width={w + 8} height={h + 8} rx={8} fill="none" stroke={withAlpha(SELECTION_COLOR, 0.4)} strokeWidth={1.5} />
      {selected && <rect className="wm-ui" x={-4} y={-4} width={w + 8} height={h + 8} rx={8} fill="none" stroke={SELECTION_COLOR} strokeWidth={2} />}
      {dropTarget && <rect className="wm-ui" x={-5} y={-5} width={w + 10} height={h + 10} rx={9} fill={withAlpha(SELECTION_COLOR, 0.08)} stroke={SELECTION_COLOR} strokeWidth={2} strokeDasharray="5 3" />}
      {fold && fp && (
        <g className={"wm-ui wm-fold" + (fold.collapsed ? " wm-fold-on" : "")} transform={`translate(${fp.x},${fp.y})`} data-kind="fold" data-id={box.id}>
          <circle r={fold.collapsed ? 9 : 7} fill={background} stroke={s.lineColor} strokeWidth={1.5} />
          {fold.collapsed ? (
            <text dy="0.35em" textAnchor="middle" fontSize={fold.count > 99 ? 8 : 10} fontWeight={600} fill={s.lineColor} fontFamily="sans-serif">
              {fold.count > 999 ? "999+" : fold.count}
            </text>
          ) : (
            <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke={s.lineColor} strokeWidth={1.6} strokeLinecap="round" />
          )}
        </g>
      )}
    </g>
  );
});

import { useEffect, useRef, useState, type ReactNode } from "react";
import { THEMES } from "../../src/core/theme";
import { rootStructure } from "../../src/core/layout";
import { docTheme } from "../../src/core/doc";
import { setDocProp } from "../../src/core/ops";
import { getTopic } from "../../src/core/query";
import type { Structure } from "../../src/core/types";
import type { Actions } from "./App";
import { Icon } from "./icons";
import { langIsZh, t } from "./i18n";
import { StructureIcon, ThemeSwatch } from "./FormatPanel";

function Btn({ icon, label, onClick, disabled, active, title }: { icon: ReactNode; label?: string; onClick: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button className={"wm-tb-btn" + (active ? " wm-active" : "")} onClick={onClick} disabled={disabled} title={title ?? label}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function Menu({ icon, label, children, disabled }: { icon: ReactNode; label: string; children: (close: () => void) => ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", off, true);
    return () => window.removeEventListener("pointerdown", off, true);
  }, [open]);
  return (
    <div className="wm-menu" ref={ref}>
      <button className={"wm-tb-btn" + (open ? " wm-active" : "")} onClick={() => setOpen((o) => !o)} disabled={disabled} title={label}>
        {icon}
        <span>{label}</span>
        <Icon.chevron />
      </button>
      {open && <div className="wm-popover">{children(() => setOpen(false))}</div>}
    </div>
  );
}

const STRUCTS: Structure[] = ["map", "logic", "org", "tree"];

export function Toolbar({ actions: a, view, setView, panel, togglePanel }: { actions: Actions; view: "map" | "outline"; setView: (v: "map" | "outline") => void; panel: boolean; togglePanel: () => void }) {
  const topics = a.selection.filter((id) => !!getTopic(a.doc, id));
  const one = topics.length === 1;
  const ro = a.readOnly;
  const st = rootStructure(a.doc);
  const theme = docTheme(a.doc);
  return (
    <div className="wm-toolbar">
      <div className="wm-tb-group">
        <Btn icon={<Icon.undo />} onClick={a.undo} disabled={!a.canUndo || ro} title={t("undo")} />
        <Btn icon={<Icon.redo />} onClick={a.redo} disabled={!a.canRedo || ro} title={t("redo")} />
      </div>
      <div className="wm-tb-sep" />
      <div className="wm-tb-group">
        <Btn icon={<Icon.topic />} label={t("topic")} onClick={() => a.addTopic("sibling")} disabled={ro || view !== "map"} title={`${t("topic")} (Enter)`} />
        <Btn icon={<Icon.subtopic />} label={t("subtopic")} onClick={() => a.addTopic("child")} disabled={ro || view !== "map"} title={`${t("subtopic")} (Tab)`} />
        <Btn icon={<Icon.relationship />} label={t("relationship")} onClick={a.startLinking} disabled={ro || !one || view !== "map"} />
        <Btn icon={<Icon.summary />} label={t("summary")} onClick={() => a.addRange("summaries")} disabled={ro || !topics.length || view !== "map"} />
        <Btn icon={<Icon.boundary />} label={t("boundary")} onClick={() => a.addRange("boundaries")} disabled={ro || !topics.length || view !== "map"} />
        <Btn icon={<Icon.trash />} onClick={a.remove} disabled={ro || !a.selection.length || (a.selection.length === 1 && a.selection[0] === a.doc.root.id) || view !== "map"} title={`${t("remove")} (Delete)`} />
      </div>
      <div className="wm-tb-spacer" />
      <div className="wm-tb-group">
        <Menu icon={<Icon.structure />} label={t("structure")} disabled={ro}>
          {(close) => (
            <div className="wm-struct-grid">
              {STRUCTS.map((s) => (
                <button
                  key={s}
                  className={"wm-card" + (s === st ? " wm-active" : "")}
                  onClick={() => {
                    a.apply((d) => setDocProp({ ...d, root: { ...d.root, structure: undefined } }, "structure", s));
                    close();
                  }}
                >
                  <StructureIcon s={s} />
                  <span>{t(`structure.${s}`)}</span>
                </button>
              ))}
            </div>
          )}
        </Menu>
        <Menu icon={<Icon.theme />} label={t("theme")} disabled={ro}>
          {(close) => (
            <div className="wm-theme-grid">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={"wm-card" + (th.id === theme ? " wm-active" : "")}
                  onClick={() => {
                    a.apply((d) => setDocProp(d, "theme", th.id));
                    close();
                  }}
                >
                  <ThemeSwatch id={th.id} dark={a.dark} />
                  <span>{langIsZh() ? th.zh : th.en}</span>
                </button>
              ))}
            </div>
          )}
        </Menu>
        <Menu icon={<Icon.export />} label={t("export")}>
          {(close) => (
            <div className="wm-menu-list">
              {(["png", "svg", "md"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    close();
                    a.exportAs(f);
                  }}
                >
                  {t(`export.${f}`)}
                </button>
              ))}
            </div>
          )}
        </Menu>
      </div>
      <div className="wm-tb-sep" />
      <div className="wm-tb-group">
        <div className="wm-seg">
          <button className={view === "map" ? "wm-active" : ""} onClick={() => setView("map")} title={t("mapView")}>
            <Icon.map />
          </button>
          <button className={view === "outline" ? "wm-active" : ""} onClick={() => setView("outline")} title={t("outline")}>
            <Icon.outline />
          </button>
        </div>
        <Btn icon={<Icon.panel />} onClick={togglePanel} active={panel} title={t("format")} />
      </div>
    </div>
  );
}

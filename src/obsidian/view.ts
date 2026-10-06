// Obsidian 里的思维导图视图:一个 .wmind 文件对应一个视图,画布直接挂在视图容器里(不用 iframe)。
// 数据流和 VS Code 版一致:画布自己维护文档、撤销栈,每次编辑把序列化后的全文发过来,这里写回文件。
// 外部修改(同步 / git / Agent)由 TextFileView 重新调用 setViewData,推给画布刷新。
import { Notice, Scope, TextFileView, WorkspaceLeaf, normalizePath, moment } from "obsidian";
import { createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { App } from "../../webview/src/App";
import type { Host, HostCommand, InMsg, OutMsg } from "../../webview/src/host";
import type WeilanxMindMapPlugin from "./main";
import { t } from "./i18n";

export const VIEW_TYPE = "weilanx-mind-map";

export class WmindView extends TextFileView {
  /** 最近一次读入或画布发来的全文:与之相同的 setViewData 是自己保存引起的,不回推 */
  private lastText = "";
  private root: Root | null = null;
  private listeners = new Set<(m: InMsg) => void>();

  /** 每个视图一个宿主,多张导图同时打开互不串消息 */
  private readonly host: Host = {
    post: (m) => this.onMessage(m),
    subscribe: (handler) => {
      this.listeners.add(handler);
      return () => this.listeners.delete(handler);
    },
  };

  constructor(leaf: WorkspaceLeaf, private readonly plugin: WeilanxMindMapPlugin) {
    super(leaf);
    // 撤销 / 缩放用视图自己的快捷键作用域:只在导图获得焦点时生效,也挡住 Obsidian 的同名全局快捷键(如 Mod+= 缩放界面)
    this.scope = new Scope(this.app.scope);
    const keys: [string[], string, HostCommand][] = [
      [["Mod"], "z", "undo"],
      [["Mod", "Shift"], "z", "redo"],
      [["Mod"], "y", "redo"],
      [["Mod"], "=", "zoomIn"],
      [["Mod"], "-", "zoomOut"],
      [["Mod"], "0", "fit"],
    ];
    for (const [mods, key, c] of keys) this.scope.register(mods as never, key, () => this.command(c));
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? t("思维导图", "Mind map");
  }

  getIcon(): string {
    return "brain-circuit";
  }

  async onOpen(): Promise<void> {
    // 共享样式打包后都在 `body .wm-root …` 之下,容器本身也要带上 wm-root
    this.contentEl.addClass("wm-root", "wm-obsidian");
  }

  async onClose(): Promise<void> {
    this.unmount();
  }

  // ---------- TextFileView ----------

  setViewData(data: string, clear: boolean): void {
    if (!clear && this.root && data === this.lastText) return;
    this.lastText = data;
    if (clear || !this.root) this.mount();
    else this.emit({ type: "update", text: data });
  }

  getViewData(): string {
    return this.lastText;
  }

  clear(): void {
    this.lastText = "";
  }

  // ---------- 画布 ----------

  private unmount(): void {
    this.root?.unmount();
    this.root = null;
    this.listeners.clear();
  }

  private mount(): void {
    this.unmount();
    this.contentEl.empty();
    const el = this.contentEl.createDiv({ cls: "wm-host" });
    this.root = createRoot(el);
    // key 随文件变化:切换文件时画布状态(撤销历史、选中、视口)整体重置
    this.root.render(createElement(App, { host: this.host, key: this.file?.path ?? "" }));
  }

  private emit(m: InMsg): void {
    for (const l of this.listeners) l(m);
  }

  /** 快捷键 / 命令面板转发给画布;返回 false 阻止默认按键行为 */
  command(c: HostCommand): boolean {
    this.emit({ type: "command", command: c });
    return false;
  }

  private onMessage(m: OutMsg): void {
    switch (m.type) {
      case "ready":
        this.emit({ type: "init", text: this.lastText, lang: moment.locale(), fileName: this.file?.basename ?? "mindmap", host: "obsidian" });
        return;
      case "edit":
        this.lastText = m.text;
        this.data = m.text;
        // 默认立即保存,Agent 读文件总能读到最新内容;关掉后走 Obsidian 的 2 秒防抖保存
        if (this.plugin.settings.saveImmediately) void this.save();
        else this.requestSave();
        return;
      case "openLink":
        this.openLink(m.target);
        return;
      case "export":
        void this.exportFile(m.defaultName, m.data, m.encoding, m.note);
        return;
      case "notify":
        new Notice(m.message);
        return;
      case "openText":
        return; // Obsidian 没有通用的文本编辑器,画布不会显示这个按钮
    }
  }

  /** 网址用浏览器打开;[[笔记]]、笔记名或相对路径交给 Obsidian 的链接跳转 */
  private openLink(target: string): void {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      window.open(target, "_blank");
      return;
    }
    let link = target.trim();
    const wiki = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(link);
    if (wiki) link = wiki[1];
    void this.app.workspace.openLinkText(link, this.file?.path ?? "", false);
  }

  /** 导出到导图所在目录,重名自动加序号 */
  private async exportFile(defaultName: string, data: string, encoding: "base64" | "utf8", note?: string): Promise<void> {
    const dir = this.file?.parent?.path ?? "";
    const dot = defaultName.lastIndexOf(".");
    const stem = dot > 0 ? defaultName.slice(0, dot) : defaultName;
    const ext = dot > 0 ? defaultName.slice(dot) : "";
    let path = normalizePath(`${dir}/${stem}${ext}`);
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${dir}/${stem} ${n}${ext}`);
    try {
      const file =
        encoding === "base64" ? await this.app.vault.createBinary(path, base64ToBuffer(data)) : await this.app.vault.create(path, data);
      new Notice(t(`已导出到 ${file.path}`, `Exported to ${file.path}`) + (note ? `\n${note}` : ""));
    } catch (err) {
      new Notice(t(`导出失败:${(err as Error).message}`, `Export failed: ${(err as Error).message}`));
    }
  }
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

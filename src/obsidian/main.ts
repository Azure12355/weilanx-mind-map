// Weilanx Mind Map · Obsidian 插件入口
import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath, Notice } from "obsidian";
import { VIEW_TYPE, WmindView } from "./view";
import { newDoc, serialize } from "../core/doc";
import { fromMarkdown } from "../core/markdown";
import type { HostCommand } from "../../webview/src/host";
import { t } from "./i18n";

interface Settings {
  /** 每次编辑后立即保存(否则走 Obsidian 的 2 秒防抖) */
  saveImmediately: boolean;
}

const DEFAULTS: Settings = { saveImmediately: true };

export default class WeilanxMindMapPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };

  async onload(): Promise<void> {
    this.settings = { ...DEFAULTS, ...((await this.loadData()) as Partial<Settings> | null) };

    this.registerView(VIEW_TYPE, (leaf) => new WmindView(leaf, this));
    this.registerExtensions(["wmind"], VIEW_TYPE);

    this.addRibbonIcon("brain-circuit", t("创建思维导图", "Create mind map"), () => this.createMap());
    this.addCommand({ id: "create-mind-map", name: t("创建思维导图", "Create mind map"), callback: () => this.createMap() });

    // 当前 Markdown 笔记 → 同名思维导图
    this.addCommand({
      id: "convert-markdown",
      name: t("把当前笔记转换为思维导图", "Convert current note to mind map"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.convertMarkdown(file);
        return true;
      },
    });

    // 作用于当前导图的命令:没有打开导图时不在命令面板里显示
    const viewCommand = (id: string, cn: string, en: string, c: HostCommand) =>
      this.addCommand({
        id,
        name: t(cn, en),
        checkCallback: (checking) => {
          const view = this.app.workspace.getActiveViewOfType(WmindView);
          if (!view) return false;
          if (!checking) view.command(c);
          return true;
        },
      });
    viewCommand("undo", "撤销", "Undo", "undo");
    viewCommand("redo", "重做", "Redo", "redo");
    viewCommand("zoom-in", "放大", "Zoom in", "zoomIn");
    viewCommand("zoom-out", "缩小", "Zoom out", "zoomOut");
    viewCommand("fit", "适应画布", "Fit to screen", "fit");
    viewCommand("export-png", "导出为 PNG 图片", "Export as PNG", "export");

    // 文件列表右键:文件夹里新建导图;Markdown 笔记转换为导图
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) =>
            item
              .setTitle(t("创建思维导图 (.wmind)", "Create mind map (.wmind)"))
              .setIcon("brain-circuit")
              .onClick(() => this.createMap(file))
          );
        } else if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) =>
            item
              .setTitle(t("转换为思维导图 (.wmind)", "Convert to mind map (.wmind)"))
              .setIcon("brain-circuit")
              .onClick(() => this.convertMarkdown(file))
          );
        }
      })
    );

    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 找一个不重名的路径 */
  private freePath(dir: string, stem: string): string {
    let path = normalizePath(`${dir}/${stem}.wmind`);
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${dir}/${stem} ${n}.wmind`);
    return path;
  }

  /** 在指定目录(默认:当前文件所在目录)新建一张导图并打开 */
  async createMap(folder?: TFolder): Promise<void> {
    const dir = folder?.path ?? this.app.workspace.getActiveFile()?.parent?.path ?? "";
    const stem = t("新建思维导图", "Untitled mind map");
    const path = this.freePath(dir, stem);
    const title = path.split("/").pop()!.replace(/\.wmind$/, "");
    const file = await this.app.vault.create(path, serialize(newDoc(title)));
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  /** Markdown 大纲 → 同目录的 .wmind(重名加序号,不覆盖) */
  async convertMarkdown(file: TFile): Promise<void> {
    try {
      const md = await this.app.vault.cachedRead(file);
      const path = this.freePath(file.parent?.path ?? "", file.basename);
      const created = await this.app.vault.create(path, serialize(fromMarkdown(md, file.basename)));
      await this.app.workspace.getLeaf(true).openFile(created);
      new Notice(t(`已从 ${file.name} 生成思维导图`, `Mind map created from ${file.name}`));
    } catch (err) {
      new Notice(t(`转换失败:${(err as Error).message}`, `Convert failed: ${(err as Error).message}`));
    }
  }
}

class SettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WeilanxMindMapPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName(t("每次编辑后立即保存", "Save after every edit"))
      .setDesc(
        t(
          "开启时每次编辑都马上写入文件,Agent 和同步工具读到的总是最新内容;关闭后使用 Obsidian 默认的 2 秒延迟保存",
          "Write the file right after every edit so agents and sync tools always see the latest content. When off, Obsidian's 2-second delayed save is used"
        )
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.saveImmediately).onChange((v) => {
          this.plugin.settings.saveImmediately = v;
          void this.plugin.saveSettings();
        })
      );
  }
}

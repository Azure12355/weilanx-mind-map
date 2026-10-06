import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { t } from "./i18n";

/** webview → 扩展 */
type InMsg =
  | { type: "ready" }
  | { type: "edit"; text: string }
  | { type: "export"; format: "png" | "svg" | "md"; data: string; encoding: "base64" | "utf8"; defaultName: string; note?: string }
  | { type: "openLink"; target: string }
  | { type: "openText" }
  | { type: "notify"; level: "info" | "warn" | "error"; message: string };

/** 扩展 → webview 的快捷键命令 */
export type HostCommand = "undo" | "redo" | "zoomIn" | "zoomOut" | "fit" | "export";

export class MindMapEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "weilanx.mindMap";

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(MindMapEditorProvider.viewType, new MindMapEditorProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    new MindMapController(this.context, document, panel);
  }
}

export class MindMapController {
  /** 当前激活的导图编辑器,快捷键命令转发给它 */
  static active: MindMapController | undefined;

  /** webview 最后一次发来的全文;文档变化与它相同说明是自己写的,不回推 */
  private lastText: string | undefined;
  /** 写入队列:连续编辑只写最新的全文 */
  private pending: string | undefined;
  /** 正在写入的全文 */
  private inflight: string | undefined;
  private writing = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel
  ) {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "out", "webview"))],
    };
    panel.webview.html = this.getHtml();

    const subs: vscode.Disposable[] = [];
    panel.webview.onDidReceiveMessage((m: InMsg) => this.onMessage(m), null, subs);

    // 外部修改(Agent、git、文本编辑器):内容和自己最后写的不同才推给画布
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() !== document.uri.toString() || !e.contentChanges.length) return;
        const text = document.getText();
        if (text === this.lastText || text === this.pending || text === this.inflight) return;
        this.lastText = text;
        this.panel.webview.postMessage({ type: "update", text });
      },
      null,
      subs
    );

    if (panel.active) MindMapController.active = this;
    panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.active) MindMapController.active = this;
        else if (MindMapController.active === this) MindMapController.active = undefined;
      },
      null,
      subs
    );
    panel.onDidDispose(() => {
      if (MindMapController.active === this) MindMapController.active = undefined;
      subs.forEach((d) => d.dispose());
    });
  }

  runCommand(command: HostCommand) {
    this.panel.webview.postMessage({ type: "command", command });
  }

  private onMessage(m: InMsg) {
    switch (m.type) {
      case "ready":
        this.lastText = this.document.getText();
        this.panel.webview.postMessage({
          type: "init",
          text: this.lastText,
          lang: vscode.env.language,
          fileName: path.basename(this.document.uri.fsPath, ".wmind"),
          host: "vscode",
        });
        break;
      case "edit":
        this.lastText = m.text;
        this.enqueue(m.text);
        break;
      case "export":
        this.handleExport(m.format, m.data, m.encoding, m.defaultName, m.note);
        break;
      case "openLink":
        this.openLink(m.target);
        break;
      case "openText":
        vscode.commands.executeCommand("vscode.openWith", this.document.uri, "default");
        break;
      case "notify": {
        const fn =
          m.level === "error" ? vscode.window.showErrorMessage : m.level === "warn" ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
        fn(m.message);
        break;
      }
    }
  }

  private enqueue(text: string) {
    this.pending = text;
    if (!this.writing) void this.flush();
  }

  /** 整体替换文档内容;开启自动保存时立即落盘,Agent 读文件总能读到最新内容 */
  private async flush() {
    this.writing = true;
    try {
      while (this.pending !== undefined) {
        const text = this.pending;
        this.pending = undefined;
        this.inflight = text;
        if (text === this.document.getText()) continue;
        const edit = new vscode.WorkspaceEdit();
        const all = new vscode.Range(0, 0, this.document.lineCount, 0);
        edit.replace(this.document.uri, this.document.validateRange(all), text);
        await vscode.workspace.applyEdit(edit);
        if (vscode.workspace.getConfiguration("wmind").get<boolean>("autoSave", true) && this.pending === undefined) {
          await this.document.save();
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(t("writeFailed", (err as Error).message));
    } finally {
      this.inflight = undefined;
      this.writing = false;
    }
  }

  private async openLink(target: string) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      await vscode.env.openExternal(vscode.Uri.parse(target));
      return;
    }
    const file = path.resolve(path.dirname(this.document.uri.fsPath), target.split("#")[0]);
    if (!fs.existsSync(file)) {
      vscode.window.showWarningMessage(t("linkNotFound", target));
      return;
    }
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(file));
  }

  private async handleExport(format: string, data: string, encoding: "base64" | "utf8", defaultName: string, note?: string) {
    const dir = path.dirname(this.document.uri.fsPath);
    const filters: Record<string, string[]> = { png: ["png"], svg: ["svg"], md: ["md"] };
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(dir, defaultName)),
      filters: { [format.toUpperCase()]: filters[format] ?? [format] },
      title: t("exportTitle"),
    });
    if (!target) return;
    try {
      await vscode.workspace.fs.writeFile(target, Buffer.from(data, encoding));
      const reveal = t("reveal");
      const msg = t("exported", path.basename(target.fsPath)) + (note ? ` ${note}` : "");
      const pick = await vscode.window.showInformationMessage(msg, reveal);
      if (pick === reveal) vscode.commands.executeCommand("revealFileInOS", target);
    } catch (err) {
      vscode.window.showErrorMessage(t("exportFailed", (err as Error).message));
    }
  }

  private getHtml(): string {
    const dist = path.join(this.context.extensionPath, "out", "webview");
    const indexPath = path.join(dist, "index.html");
    if (!fs.existsSync(indexPath)) {
      return `<html><body style="font-family:sans-serif;padding:2rem">Webview not built. Run <code>npm run build:web</code>.</body></html>`;
    }
    let html = fs.readFileSync(indexPath, "utf8");
    const webview = this.panel.webview;
    html = html.replace(/(href|src)="(\.\/[^"]+)"/g, (_all, attr, rel) => {
      const uri = webview.asWebviewUri(vscode.Uri.file(path.join(dist, rel)));
      return `${attr}="${uri}"`;
    });
    return html;
  }
}

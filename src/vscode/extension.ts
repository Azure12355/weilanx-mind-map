import * as vscode from "vscode";
import * as path from "path";
import { HostCommand, MindMapController, MindMapEditorProvider } from "./editor";
import { newDoc, serialize } from "../core/doc";
import { fromMarkdown } from "../core/markdown";
import { t } from "./i18n";

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function isDir(uri: vscode.Uri): Promise<boolean> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

/** 写入新文件并用导图编辑器打开;重名时询问是否覆盖 */
async function writeAndOpen(target: vscode.Uri, content: string): Promise<boolean> {
  if (await exists(target)) {
    const ow = t("overwrite");
    const pick = await vscode.window.showWarningMessage(t("exists", path.basename(target.fsPath)), { modal: true }, ow);
    if (pick !== ow) return false;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
  await vscode.commands.executeCommand("vscode.openWith", target, MindMapEditorProvider.viewType);
  return true;
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(MindMapEditorProvider.register(context));

  // 画布内快捷键:VS Code 会先按自己的快捷键处理,所以撤销 / 缩放等需要注册成命令再转发给画布
  const hostCommands: Record<string, HostCommand> = {
    "wmind.undo": "undo",
    "wmind.redo": "redo",
    "wmind.zoomIn": "zoomIn",
    "wmind.zoomOut": "zoomOut",
    "wmind.fit": "fit",
    "wmind.export": "export",
    "wmind.find": "find",
    "wmind.replace": "replace",
  };
  for (const [id, command] of Object.entries(hostCommands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, () => MindMapController.active?.runCommand(command)));
  }

  // 新建思维导图:右键文件夹 / 命令面板
  context.subscriptions.push(
    vscode.commands.registerCommand("wmind.create", async (uri?: vscode.Uri) => {
      const name = await vscode.window.showInputBox({
        prompt: t("createPrompt"),
        value: t("createDefault"),
        validateInput: (v) => (v.trim() ? undefined : t("createValidate")),
      });
      if (!name) return;
      const base = name.trim().replace(/\.wmind$/, "");
      let folder: vscode.Uri | undefined;
      if (uri) folder = (await isDir(uri)) ? uri : vscode.Uri.file(path.dirname(uri.fsPath));
      folder ??= vscode.workspace.workspaceFolders?.[0]?.uri;
      let target: vscode.Uri | undefined;
      if (folder) target = vscode.Uri.joinPath(folder, base + ".wmind");
      else target = await vscode.window.showSaveDialog({ filters: { "Mind Map": ["wmind"] }, defaultUri: vscode.Uri.file(base + ".wmind") });
      if (!target) return;
      await writeAndOpen(target, serialize(newDoc(base)));
    })
  );

  // Markdown 大纲 → 同名 .wmind
  context.subscriptions.push(
    vscode.commands.registerCommand("wmind.importMarkdown", async (uri?: vscode.Uri) => {
      uri ??= vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        const picked = await vscode.window.showOpenDialog({ filters: { Markdown: ["md", "markdown"] }, canSelectMany: false });
        uri = picked?.[0];
      }
      if (!uri) return;
      try {
        const md = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        const title = path.basename(uri.fsPath).replace(/\.(md|markdown)$/i, "");
        const target = vscode.Uri.file(path.join(path.dirname(uri.fsPath), title + ".wmind"));
        if (await writeAndOpen(target, serialize(fromMarkdown(md, title)))) {
          vscode.window.showInformationMessage(t("imported", path.basename(uri.fsPath)));
        }
      } catch (err) {
        vscode.window.showErrorMessage(t("importFailed", (err as Error).message));
      }
    })
  );

  // 用文本编辑器打开(查看 / 手改 JSON)
  context.subscriptions.push(
    vscode.commands.registerCommand("wmind.openAsText", async (uri?: vscode.Uri) => {
      const target = uri ?? (vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined)?.uri;
      if (target) await vscode.commands.executeCommand("vscode.openWith", target, "default");
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("wmind.openAsMindMap", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) await vscode.commands.executeCommand("vscode.openWith", target, MindMapEditorProvider.viewType);
    })
  );
}

export function deactivate() {}

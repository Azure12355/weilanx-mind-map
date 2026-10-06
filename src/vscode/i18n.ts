import * as vscode from "vscode";

const zh = {
  writeFailed: "写入思维导图失败:{0}",
  linkNotFound: "找不到链接的文件:{0}",
  exportTitle: "导出思维导图",
  reveal: "在访达中显示",
  exported: "已导出到 {0}。",
  exportFailed: "导出失败:{0}",
  createPrompt: "思维导图名称",
  createDefault: "新建思维导图",
  createValidate: "请输入名称",
  exists: "文件已存在:{0}",
  overwrite: "覆盖",
  noFolder: "请先打开一个文件夹",
  imported: "已从 {0} 生成思维导图",
  importFailed: "导入失败:{0}",
};

const en: typeof zh = {
  writeFailed: "Failed to write mind map: {0}",
  linkNotFound: "Linked file not found: {0}",
  exportTitle: "Export Mind Map",
  reveal: "Reveal in File Explorer",
  exported: "Exported to {0}.",
  exportFailed: "Export failed: {0}",
  createPrompt: "Mind map name",
  createDefault: "New Mind Map",
  createValidate: "Please enter a name",
  exists: "File already exists: {0}",
  overwrite: "Overwrite",
  noFolder: "Please open a folder first",
  imported: "Mind map created from {0}",
  importFailed: "Import failed: {0}",
};

export function t(key: keyof typeof zh, ...args: string[]): string {
  const dict = vscode.env.language.toLowerCase().startsWith("zh") ? zh : en;
  return dict[key].replace(/\{(\d)\}/g, (_m, i) => args[Number(i)] ?? "");
}

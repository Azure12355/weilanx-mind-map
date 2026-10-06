# Weilanx Mind Map · Obsidian 插件

日期：2026-10-06
状态：已实现（参照 Weilanx Base Table 的 Obsidian 版做法）

## 目标

在 Obsidian 里用和 VS Code 版相同的画布打开、编辑 `.wmind` 文件。两端放在同一个仓库，统一版本号，共用 `src/core` 和 `webview/`。

## 结构

```
src/obsidian/  main.ts    Plugin：注册视图和 .wmind 扩展名、命令、功能区图标、右键菜单、设置
               view.ts    WmindView extends TextFileView，React 画布直接挂在 contentEl 里（不用 iframe）
               theme.css  --vscode-* → Obsidian 主题变量映射；还原 Obsidian 对表单控件的全局样式
               i18n.ts    命令名跟随 Obsidian 语言
webview/src/   host.ts         Host 接口；App 通过 props 接收 host，每个视图一个，多张导图互不串消息
               previewHost.ts  浏览器预览用的宿主（只在 VS Code / 预览入口 main.tsx 里引用）
               page.css        只属于 VS Code / 预览的整页样式，Obsidian 版不打包
```

## 关键决定

- **数据流不变**：画布自己维护文档和撤销栈，每次编辑发来全文；视图保存为 `getViewData()`。外部修改由 `setViewData` 推给画布，与自己刚保存的全文相同时忽略。
- **保存时机**：默认每次编辑立即 `save()`，Agent 读文件总是最新；设置里可改回 Obsidian 的 2 秒防抖保存。
- **快捷键**：撤销 / 重做 / 放大 / 缩小 / 适应画布注册在视图自己的 `Scope` 上，只在导图获得焦点时生效，同时挡住 Obsidian 同名的全局快捷键（如 `Mod+=` 缩放界面）。其余按键（Enter、Tab、Delete、方向键、空格）由画布处理。
- **全局事件隔离**：画布的 keydown / copy / paste 监听只处理目标在本画布根元素内的事件；导出时只在本画布内查找 SVG。
- **样式隔离**：共享样式全部写在 `.wm-root` 之下，打包时整体包进 `body .wm-root { … }`；视图容器本身也带 `wm-root` 类。
- **主题**：画布配色主题（经典、清新……）的亮 / 暗版本按 `body.theme-dark / theme-light` 选择。
- **链接**：`http(s)://` 用浏览器打开；`[[笔记]]`、笔记名、相对路径交给 `workspace.openLinkText`。
- **导出**：PNG 用 `vault.createBinary`，SVG / Markdown 用 `vault.create`，保存在导图所在目录，重名加序号。
- **错误页**：JSON 损坏时画布显示错误信息；Obsidian 版不显示「用文本编辑器打开」按钮。视图不修改坏文件。
- **手机端**：`isDesktopOnly: false`，只用 Vault 接口。画布加了双指缩放，工具栏加了删除按钮。

## 测试

- 单元测试与 CLI 测试不变（31 个）。
- 用最小的 `obsidian` 桩在无头浏览器里并排挂载两个 WmindView，并加入故意干扰的全局样式，检查：样式不被 Obsidian 全局规则污染；键盘编辑只影响获得焦点的那张导图；每次编辑都写回；视图命令撤销生效；外部修改实时刷新；`theme-dark` 切换生效。
- 真机：构建产物已装进 `obsidian-plugin-dev` 库，由用户在 Obsidian 桌面端 / 手机端验收。

// 中英切换 / 场景与安装标签页 / 复制按钮 / 滚动显现
document.documentElement.classList.add("js");

const DICT = {
  en: {
    title: "Weilanx Mind Map · XMind-style mind maps for VS Code and Obsidian",
    "nav.ai": "AI workflow",
    "nav.features": "Features",
    "nav.scenes": "Use cases",
    "nav.data": "File format",
    "nav.install": "Install",
    "cta.free": "Get it free",
    "cta.github": "Star on GitHub",
    "hero.new": "New",
    "hero.badge": "Now on Obsidian too",
    "hero.l1": 'Think <em class="script">in maps</em>',
    "hero.l2": 'Keep it <em class="script">plain JSON</em>',
    "hero.sub": "XMind-style mind maps inside VS Code and Obsidian. Every map is one JSON file that you, git and your AI agent can all read and edit.",
    "hero.note": "Free and open source · MIT · No account, no cloud",
    "hero.you": "You",
    "hero.ai": "Claude is editing",
    "hero.chipNote": "Note: ship by Friday",
    "hero.chipMarker": "MVP scope",
    "logos.title": "Works where you already think",
    "ai.title": "Now in your <br />AI workflow",
    "ai.sub": "Your agent reads the map as an outline, adds branches by path and validates every edit. The canvas redraws the moment the file changes.",
    "ai.p1": "Ready-made skill for Claude Code and friends",
    "ai.p2": "Zero-dependency CLI: wm.mjs",
    "ai.p3": "Byte-identical output to the plugin",
    "ai.cta": "Install the skill",
    "features.title": "Tools that think with you",
    "features.sub": "The editing feel of XMind, the openness of a text file.",
    "f1.t": "Edit like XMind",
    "f1.d": "Enter for a sibling, Tab for a child, drag to re-parent. Markers, labels, notes, links, relationships, summaries and boundaries are all here.",
    "f1.k1": "Keyboard first",
    "f1.k2": "Drag & drop",
    "f1.k3": "Undo / redo",
    "f1.k4": "IME friendly",
    "f2.t": "Six themes, light and dark",
    "f2.d": "Classic, Fresh, Business, Night, Sketch and Mono. Each has a light and a dark version that follows your editor.",
    "f3.t": "Four structures",
    "f3.d": "Mind map, logic chart, org chart and tree chart, for the whole map or a single branch.",
    "f4.t": "Outline view",
    "f4.d": "Write the whole map as an indented list. Same shortcuts, same file.",
    "f5.t": "And so much more",
    "f5.a": "Export PNG (2x), SVG and Markdown",
    "f5.b": "Turn a Markdown outline into a map",
    "f5.c": "Follows VS Code and Obsidian dark mode",
    "f5.d": "[[note]] links in Obsidian",
    "f5.e": "Paste Markdown or indented text as topics",
    "f5.f": "Pan, pinch and zoom, even on touch",
    "scenes.title": "For the way you think",
    "scenes.sub": "From a quick brainstorm to a plan your agent keeps up to date.",
    "sc.brain": "Brainstorming",
    "sc.plan": "Planning",
    "sc.learn": "Learning",
    "sc.agent": "With your agent",
    "sc.brain.t": "Get every idea down, fast",
    "sc.brain.d": "Type, press Enter, keep going. Rainbow branches keep twenty ideas readable, and summaries pull them together.",
    "sc.plan.t": "Plans with priorities and progress",
    "sc.plan.d": "Priority and task markers, boundaries for this sprint, and an org chart when you need the big picture.",
    "sc.learn.t": "Notes that become maps",
    "sc.learn.d": "Right-click a Markdown outline to turn it into a map, then switch to the outline view to keep writing.",
    "sc.agent.t": "Let your agent keep it current",
    "sc.agent.d": "“Add the three test tasks under QA and mark the first one urgent.” The agent edits the file, and the canvas redraws while you watch.",
    "data.title": "Your map, your file",
    "data.sub": "No database, no account, no lock-in. Just JSON on your disk.",
    "data.json": "Plain JSON, nested like your thoughts",
    "data.git": "Clean git diffs",
    "data.git.d": "Fixed key order and indentation. Only non-default values are written.",
    "data.local": "Local first",
    "data.local.d": "Your files never leave your machine. Sync them however you like.",
    "data.schema": "JSON Schema included",
    "data.schema.d": "Completion and validation when you open the raw JSON.",
    "data.oss": "MIT, ad-free, no tracking",
    "data.oss.d": "Read every line of the source on GitHub.",
    "st.themes": "built-in themes",
    "st.structures": "layout structures",
    "st.hosts": "hosts: VS Code & Obsidian",
    "st.deps": "dependencies in the agent CLI",
    "install.title": "Up and running in a minute",
    "install.sub": "Pick where you think. Or hand the job to your agent.",
    "install.agent": "Agent skill",
    "install.prompt": "Ask your agent",
    "install.vscode": "Installs into every VS Code based editor it finds (VS Code, Cursor, Windsurf, Insiders):",
    "install.vscode2": 'Or download <a href="https://github.com/Azure12355/weilanx-mind-map/releases/latest/download/weilanx-mind-map.vsix">weilanx-mind-map.vsix</a> and choose <b>Install from VSIX…</b> in the Extensions view.',
    "install.obsidian": "Pass your vault path. The plugin is copied in and enabled:",
    "install.obsidian2": 'Or put <code>main.js</code>, <code>manifest.json</code> and <code>styles.css</code> from the <a href="https://github.com/Azure12355/weilanx-mind-map/releases/latest">latest release</a> into <code>.obsidian/plugins/weilanx-mind-map/</code>, or use BRAT with <code>Azure12355/weilanx-mind-map</code>.',
    "install.skill": "Installs SKILL.md and wm.mjs into ~/.claude/skills (Node 18+):",
    "install.skill2": "For another agent, append its skills folder after --skill.",
    "install.promptHint": "Paste this into Claude Code, Codex, Cursor or any agent with a terminal:",
    "install.promptText":
      "Install the Weilanx Mind Map plugin and its agent skill for me.\nFollow https://github.com/Azure12355/weilanx-mind-map/blob/main/docs/install-for-agents.md,\nverify the install, then tell me the result.",
    "final.title": 'Visualize your ideas. <em class="script">Keep</em> them yours.',
    "final.sub": "Free, open source and ready in VS Code and Obsidian today.",
    "footer.tag": "XMind-style mind maps, stored as plain JSON.",
    "footer.product": "Product",
    "footer.resources": "Resources",
    "footer.releases": "Releases",
    "footer.agents": "Install for agents",
    "footer.format": "Format reference",
    "footer.more": "More from Weilanx",
    "footer.feedback": "Feedback",
    "footer.made": "Made for people and their agents.",
  },
  zh: {
    title: "Weilanx Mind Map · VS Code 和 Obsidian 里的 XMind 风格思维导图",
    "nav.ai": "AI 工作流",
    "nav.features": "功能",
    "nav.scenes": "使用场景",
    "nav.data": "文件格式",
    "nav.install": "安装",
    "cta.free": "免费安装",
    "cta.github": "去 GitHub 点 Star",
    "hero.new": "新",
    "hero.badge": "Obsidian 版也来了",
    "hero.l1": '用<em class="script">导图</em>思考',
    "hero.l2": '用 <em class="script">JSON</em> 沉淀',
    "hero.sub": "在 VS Code 和 Obsidian 里使用 XMind 风格的思维导图。每张导图就是一个 JSON 文件，你、git 和你的 AI Agent 都能直接读写。",
    "hero.note": "免费开源 · MIT 协议 · 不用注册，不上云",
    "hero.you": "你",
    "hero.ai": "Claude 正在编辑",
    "hero.chipNote": "备注：周五前上线",
    "hero.chipMarker": "MVP 范围",
    "logos.title": "在你已经在用的工具里思考",
    "ai.title": "接入你的<br />AI 工作流",
    "ai.sub": "Agent 先把导图读成一份缩进大纲，再按路径添加分支，每次改完都会校验。文件一变，画布马上重画。",
    "ai.p1": "给 Claude Code 等 Agent 准备好的 skill",
    "ai.p2": "零依赖命令行 wm.mjs",
    "ai.p3": "写出的文件和插件逐字节一致",
    "ai.cta": "安装 skill",
    "features.title": "和你一起思考的工具",
    "features.sub": "XMind 的编辑手感，文本文件的开放。",
    "f1.t": "像 XMind 一样编辑",
    "f1.d": "Enter 加同级，Tab 加子级，拖拽改层级。标记、标签、备注、链接、联系线、概括、外框，一样不少。",
    "f1.k1": "键盘优先",
    "f1.k2": "拖拽排列",
    "f1.k3": "撤销 / 重做",
    "f1.k4": "中文输入法友好",
    "f2.t": "6 套主题，亮暗双版本",
    "f2.d": "经典、清新、商务、暗夜、手写、黑白。每套都有亮色和暗色版本，跟着编辑器自动切换。",
    "f3.t": "4 种结构",
    "f3.d": "思维导图、逻辑图、组织结构图、树形图，可以给整张图设，也可以只给某个分支设。",
    "f4.t": "大纲视图",
    "f4.d": "把整张导图当成缩进列表来写。快捷键一样，文件也是同一个。",
    "f5.t": "还有更多",
    "f5.a": "导出 PNG（2 倍清晰度）、SVG、Markdown",
    "f5.b": "Markdown 大纲一键转成导图",
    "f5.c": "跟随 VS Code 和 Obsidian 的暗色模式",
    "f5.d": "在 Obsidian 里支持 [[笔记]] 链接",
    "f5.e": "粘贴 Markdown 或缩进文本，自动拆成主题",
    "f5.f": "平移、缩放，触屏上也能双指缩放",
    "scenes.title": "适合你的每一种思考方式",
    "scenes.sub": "从一次快速的头脑风暴，到一份由 Agent 帮你持续更新的计划。",
    "sc.brain": "头脑风暴",
    "sc.plan": "项目规划",
    "sc.learn": "学习笔记",
    "sc.agent": "和 Agent 协作",
    "sc.brain.t": "想到就记，越写越快",
    "sc.brain.d": "打字、回车、继续写。彩虹分支让二十个想法依然清楚，再用概括把它们收拢起来。",
    "sc.plan.t": "有优先级、有进度的计划",
    "sc.plan.d": "用优先级和任务进度标记排好事项，用外框圈出这个迭代，需要看全局时切成组织结构图。",
    "sc.learn.t": "笔记一键变导图",
    "sc.learn.d": "右键 Markdown 大纲就能转成导图，然后切到大纲视图接着写。",
    "sc.agent.t": "让 Agent 帮你保持更新",
    "sc.agent.d": "“在测试验收下面加三个测试任务，第一个标成最高优先级。”Agent 改完文件，画布当着你的面刷新。",
    "data.title": "你的导图，你的文件",
    "data.sub": "没有数据库，不用注册账号，不会被锁定。只是你硬盘上的一个 JSON 文件。",
    "data.json": "普通 JSON，像你的思路一样层层嵌套",
    "data.git": "git diff 干净",
    "data.git.d": "键的顺序和缩进固定，只写和默认值不同的字段。",
    "data.local": "本地优先",
    "data.local.d": "文件不会离开你的电脑，想怎么同步都可以。",
    "data.schema": "自带 JSON Schema",
    "data.schema.d": "直接打开 JSON 时也有补全和校验。",
    "data.oss": "MIT 开源，无广告，无追踪",
    "data.oss.d": "每一行源码都在 GitHub 上。",
    "st.themes": "套内置主题",
    "st.structures": "种布局结构",
    "st.hosts": "个平台：VS Code 和 Obsidian",
    "st.deps": "个依赖：Agent 命令行开箱即用",
    "install.title": "一分钟就能用上",
    "install.sub": "选一个你常用的工具，或者直接交给 Agent。",
    "install.agent": "Agent skill",
    "install.prompt": "交给 Agent",
    "install.vscode": "自动找到本机所有基于 VS Code 的编辑器（VS Code、Cursor、Windsurf、Insiders），逐个安装：",
    "install.vscode2": '也可以下载 <a href="https://github.com/Azure12355/weilanx-mind-map/releases/latest/download/weilanx-mind-map.vsix">weilanx-mind-map.vsix</a>，在扩展面板里选 <b>从 VSIX 安装…</b>。',
    "install.obsidian": "把库的路径传进去，插件会自动复制进去并启用：",
    "install.obsidian2": '也可以从<a href="https://github.com/Azure12355/weilanx-mind-map/releases/latest">最新 Release</a> 下载 <code>main.js</code>、<code>manifest.json</code>、<code>styles.css</code>，放进 <code>.obsidian/plugins/weilanx-mind-map/</code>；或者用 BRAT 填入 <code>Azure12355/weilanx-mind-map</code>。',
    "install.skill": "把 SKILL.md 和 wm.mjs 装进 ~/.claude/skills（需要 Node 18+）：",
    "install.skill2": "其他 Agent 在 --skill 后面写上它的 skills 目录即可。",
    "install.promptHint": "把这段话粘贴给 Claude Code、Codex、Cursor 或任何能用终端的 Agent：",
    "install.promptText":
      "帮我安装 Weilanx Mind Map 思维导图插件和它的 Agent skill。\n按照 https://github.com/Azure12355/weilanx-mind-map/blob/main/docs/install-for-agents.md 操作，\n装完先校验，再告诉我结果。",
    "final.title": '把想法画出来，<em class="script">留</em>在自己手里。',
    "final.sub": "免费、开源，现在就能在 VS Code 和 Obsidian 里使用。",
    "footer.tag": "XMind 风格的思维导图，数据就是一个 JSON 文件。",
    "footer.product": "产品",
    "footer.resources": "资源",
    "footer.releases": "版本发布",
    "footer.agents": "Agent 安装说明",
    "footer.format": "格式参考",
    "footer.more": "蔚蓝的其他作品",
    "footer.feedback": "问题反馈",
    "footer.made": "为人和他们的 Agent 而做。",
  },
};

function pickLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "zh" || q === "en") return q;
  const saved = localStorage.getItem("wmind-site-lang");
  if (saved === "zh" || saved === "en") return saved;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function applyLang(lang) {
  const d = DICT[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = d.title;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = d[el.dataset.i18n];
    if (v !== undefined) el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const v = d[el.dataset.i18nHtml];
    if (v !== undefined) el.innerHTML = v;
  });
  document.querySelector("#lang-toggle span").textContent = lang === "zh" ? "English" : "中文";
}

let lang = pickLang();
applyLang(lang);
document.getElementById("lang-toggle").addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh";
  localStorage.setItem("wmind-site-lang", lang);
  applyLang(lang);
});

// 标签页:场景 / 安装
function tabs(tabSel, panelSel, key) {
  const tabsEls = document.querySelectorAll(tabSel);
  tabsEls.forEach((t) =>
    t.addEventListener("click", () => {
      const v = t.dataset[key];
      tabsEls.forEach((x) => x.classList.toggle("active", x === t));
      document.querySelectorAll(panelSel).forEach((p) => p.classList.toggle("active", p.dataset[key] === v));
    })
  );
}
tabs(".scene-tab", ".scene-panel", "scene");
tabs(".install-tab", ".install-panel", "tab");

// 「安装 skill」按钮:滚到安装区并切到 Agent skill 标签
document.querySelectorAll('a[href="#install-agent"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("install-agent").click();
    document.getElementById("install").scrollIntoView({ behavior: "smooth" });
  })
);

// 复制按钮
document.querySelectorAll(".copy").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const text = btn.parentElement.querySelector("pre").textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("done");
      btn.innerHTML = '<i class="ph ph-check"></i>';
      setTimeout(() => {
        btn.classList.remove("done");
        btn.innerHTML = '<i class="ph ph-copy"></i>';
      }, 1600);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  })
);

// 导航吸顶后加分隔线
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// 滚动显现
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

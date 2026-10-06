---
name: weilanx-mind-map
description: Read, summarize and edit Weilanx Mind Map files, XMind-style mind maps stored as plain JSON in `.wmind` files (opened as a visual mind map by the Weilanx Mind Map VS Code plugin). Use this skill whenever the user wants to look at, summarize, add / rename / move / delete topics in, restyle, add markers / labels / notes / links / relationships / summaries / boundaries to, change the theme or layout of, validate, create, or convert to / from Markdown such a mind map, including requests like "往这个导图里加几个分支""把产品规划.wmind 整理成大纲""给 MVP 那个节点标个高优先级""把这份 Markdown 做成思维导图""新建一个读书计划导图", even if they only say "思维导图 / 脑图 / 导图文件" for a local file. Do NOT use it for XMind's own `.xmind` files, Feishu / Lark whiteboards (use lark-whiteboard) or drawing diagrams as images.
---

# Weilanx Mind Map

A Weilanx Mind Map is one JSON file (`.wmind`) holding a whole map as a nested tree:

```json
{
  "version": 1,
  "root": {
    "id": "a1b2c3",
    "text": "产品规划",
    "children": [
      { "id": "k9x2m1", "text": "用户调研", "markers": ["priority-1"], "children": [{ "id": "p0q9w8", "text": "访谈 10 人" }] },
      { "id": "z7y6x5", "text": "MVP", "style": { "fill": "#FFE8A3" } }
    ]
  }
}
```

The user usually has the file open in VS Code, and the plugin redraws the map as soon as the file changes. Every edit you make shows up in front of them right away, and a broken edit replaces their map with an error page. So edits go through the bundled script, which writes exactly the format the plugin writes.

## The script

`scripts/wm.mjs` (Node 18+, no dependencies) does every read and write. Call it with the absolute path of this skill's directory:

```bash
WM="node <skill-dir>/scripts/wm.mjs"
$WM help
```

Topics are addressed by **id** or by **path**: topic texts joined with `/`, starting from the central topic, e.g. `产品规划/用户调研/访谈 10 人`. Write a literal `/` inside a text as `\/`; line breaks in a text count as spaces. If a path matches more than one topic the script stops and lists the candidate ids, so use the id after that.

## Workflow

1. **Read first.** `$WM outline <file>` prints the whole map as an indented list, with markers, labels, a note excerpt, summaries, boundaries and relationships. It is much shorter than the JSON, so use it instead of reading the file. Add `--ids` when you plan to edit, and `--depth 2` for a quick look at a big map. `$WM find <file> <keyword>` searches text, notes and labels.
2. **Write with the matching command.**
   ```bash
   $WM add m.wmind --parent "产品规划" "竞品分析" "定价策略"          # several children at once, prints new ids
   $WM add m.wmind --parent "产品规划/竞品分析" "XMind\n桌面端" --index 0   # \n = line break
   $WM set m.wmind "产品规划/MVP" --text "MVP 一期" --marker priority-1 --marker task-50 --label Q4
   $WM set m.wmind k9x2m1 --style fill=#FFE8A3 --style bold=true --note "访谈提纲见飞书" --link https://example.com
   $WM set m.wmind k9x2m1 --collapsed true --structure org
   $WM unset m.wmind k9x2m1 --marker task-50 --style fill --note
   $WM move m.wmind "产品规划/定价策略" --parent "产品规划/MVP" --index 0
   $WM rm m.wmind "产品规划/临时想法"
   $WM rel m.wmind "产品规划/用户调研" "产品规划/MVP" --text "输入需求"
   $WM summary m.wmind "产品规划/MVP/A" "产品规划/MVP/C" --text "两周完成"   # first and last sibling of the range
   $WM boundary m.wmind "产品规划/MVP/A" "产品规划/MVP/B" --text "本迭代"
   $WM doc m.wmind --theme fresh --structure logic
   $WM new plan.wmind "读书计划"
   $WM from-md outline.md -o plan.wmind        # Markdown outline → map
   $WM to-md plan.wmind > plan.md              # map → Markdown outline
   ```
   To build a big map from scratch, writing a Markdown outline and running `from-md` is usually easiest: `#` is the central topic, `##` are main branches, `-` lists nest below them, `> ` lines become the note of the item above, a trailing `` `#tag` `` becomes a label, `[text](url)` becomes a link, and `[ ]` / `[x]` become task markers.
3. **Validate after writing.** `$WM validate <file>` exits with code 1 and lists problems. Fix them before telling the user you are done.
4. **Report back in plain words:** which topics you added, moved or changed, using their paths rather than ids.

## Editing the JSON directly

For a large restructuring (reordering many branches, rewriting most texts) you may edit the file directly. Rules the plugin relies on:

- New topics may omit `id`; the plugin assigns one. Never reuse or change an existing id: summaries, boundaries and relationships point at ids.
- Write only what differs from the defaults. Leave out `style` to follow the theme, leave out empty arrays, and write `collapsed` only when it is `true`.
- `summaries` / `boundaries` live on the **parent** topic and name the first and last child of the range by id.
- Colors are `#RRGGBB`. Unknown fields are kept but ignored.
- Run `$WM validate` afterwards. Any `$WM` write command also rewrites the file in the plugin's canonical key order and indentation.

The full field list, every style key, marker id and theme is in `references/format.md`. Read it when you need a value that isn't shown above.

## Judgment calls

- **Deleting a topic deletes its whole subtree** and any relationship touching it. If the subtree is big or the user's wording is vague, show what will go (`$WM outline` of that branch) and confirm first.
- **Keep the user's wording.** Topic text is the user's content. Don't polish, translate or shorten it unless asked.
- **Markers and colors mean something to the user.** Use priority markers for priority and task markers for progress. Don't recolor branches the user didn't mention.
- **Markdown export drops** styles, most markers, relationships, summaries, boundaries and floating topics. Say so when you export.

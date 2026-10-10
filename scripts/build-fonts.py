#!/usr/bin/env python3
"""手绘风格字体:从 @excalidraw/excalidraw 包里取 Excalifont / 小赖分片,
小赖裁成 GB2312 常用字子集,输出到 webview/src/fonts/,并生成 webview/src/fonts/index.ts。

用法(需要 fonttools 与 brotli):
  npm pack @excalidraw/excalidraw && tar xzf excalidraw-excalidraw-*.tgz
  python3 scripts/build-fonts.py package/dist/prod/fonts
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "webview" / "src" / "fonts"


def gb2312() -> set[int]:
    cps = set()
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                cps.add(ord(bytes([hi, lo]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    cps.update(range(0x3000, 0x3040))  # CJK 标点
    cps.update(range(0xFF00, 0xFFF0))  # 全角字符
    return cps


def ranges(cps: list[int]) -> str:
    """码位列表 → CSS unicode-range"""
    out, start, prev = [], None, None
    for c in sorted(cps):
        if start is None:
            start = prev = c
        elif c == prev + 1:
            prev = c
        else:
            out.append((start, prev))
            start = prev = c
    if start is not None:
        out.append((start, prev))
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out)


def save(font: TTFont, path: Path) -> None:
    font.flavor = "woff2"
    font.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.woff2"):
        f.unlink()
    entries = []

    # Excalifont:原样保留各分片
    for i, f in enumerate(sorted((SRC / "Excalifont").glob("*.woff2"))):
        cps = sorted(TTFont(f).getBestCmap().keys())
        name = f"excalifont-{i}.woff2"
        (OUT / name).write_bytes(f.read_bytes())
        entries.append({"family": "Excalifont", "file": name, "range": ranges(cps)})

    # 小赖:每个分片只留 GB2312 字符,空分片丢弃
    keep = gb2312()
    n = 0
    total = 0
    for f in sorted((SRC / "Xiaolai").glob("*.woff2")):
        cps = sorted(c for c in TTFont(f).getBestCmap().keys() if c in keep)
        if not cps:
            continue
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        font = TTFont(f)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=cps)
        sub.subset(font)
        name = f"xiaolai-{n}.woff2"
        save(font, OUT / name)
        total += (OUT / name).stat().st_size
        entries.append({"family": "Xiaolai", "file": name, "range": ranges(cps)})
        n += 1

    lines = [
        "// 由 scripts/build-fonts.py 生成,不要手改",
        "// Excalifont 与小赖字体(Xiaolai)均为 SIL OFL 1.1 授权,见 webview/public/LICENSE-OFL.txt",
    ]
    for i, e in enumerate(entries):
        lines.append(f'import f{i} from "./{e["file"]}";')
    lines.append("")
    lines.append("export interface FontShard {")
    lines.append('  family: "Excalifont" | "Xiaolai";')
    lines.append("  url: string;")
    lines.append("  /** CSS unicode-range */")
    lines.append("  range: string;")
    lines.append("}")
    lines.append("")
    lines.append("export const SHARDS: FontShard[] = [")
    for i, e in enumerate(entries):
        lines.append(f'  {{ family: "{e["family"]}", url: f{i}, range: {json.dumps(e["range"])} }},')
    lines.append("];")
    (OUT / "index.ts").write_text("\n".join(lines) + "\n")
    print(f"Excalifont 分片 {len(entries) - n} 个,小赖分片 {n} 个,小赖共 {total / 1024 / 1024:.2f} MB")


main()

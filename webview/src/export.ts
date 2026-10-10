// 导出 SVG / PNG:克隆画布上的图形,去掉选中框、折叠按钮等界面元素
const PAD = 40;

export function buildSvg(world: SVGGElement, background: string, fontCss = ""): { svg: string; w: number; h: number } {
  const bb = world.getBBox();
  const clone = world.cloneNode(true) as SVGGElement;
  clone.querySelectorAll(".wm-ui, .wm-ghost").forEach((el) => el.remove());
  clone.setAttribute("transform", `translate(${PAD - bb.x},${PAD - bb.y})`);
  const w = Math.ceil(bb.width + PAD * 2);
  const h = Math.ceil(bb.height + PAD * 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (fontCss ? `<defs><style>${fontCss}</style></defs>` : "") +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    new XMLSerializer().serializeToString(clone) +
    `</svg>`;
  return { svg, w, h };
}

export async function svgToPngBase64(svg: string, w: number, h: number, scale = 2): Promise<string> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  // SVG 里内嵌的 @font-face 在 decode 之后才异步就绪,先画一次触发加载,稍等再正式绘制
  if (svg.includes("@font-face")) {
    const warm = document.createElement("canvas").getContext("2d")!;
    warm.drawImage(img, 0, 0, 1, 1);
    await new Promise((r) => setTimeout(r, 400));
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png").split(",")[1];
}

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// 导出 SVG / PNG:克隆画布上的图形,去掉选中框、折叠按钮等界面元素
const PAD = 40;

export function buildSvg(world: SVGGElement, background: string): { svg: string; w: number; h: number } {
  const bb = world.getBBox();
  const clone = world.cloneNode(true) as SVGGElement;
  clone.querySelectorAll(".wm-ui, .wm-ghost").forEach((el) => el.remove());
  clone.setAttribute("transform", `translate(${PAD - bb.x},${PAD - bb.y})`);
  const w = Math.ceil(bb.width + PAD * 2);
  const h = Math.ceil(bb.height + PAD * 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    new XMLSerializer().serializeToString(clone) +
    `</svg>`;
  return { svg, w, h };
}

export async function svgToPngBase64(svg: string, w: number, h: number, scale = 2): Promise<string> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
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

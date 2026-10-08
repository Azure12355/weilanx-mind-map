// 激光笔:录屏演示用。开启后拦截画布上的指针事件(滚轮照常平移 / 缩放),
// 悬停显示红点,按住拖动画出发光轨迹,松开后淡出。Esc 退出。
import { useEffect, useRef } from "react";

interface Pt {
  x: number;
  y: number;
}
interface Stroke {
  pts: Pt[];
  /** 松开的时间;未松开为 null */
  end: number | null;
}

const HOLD = 500;
const FADE = 600;
const COLOR = "255, 59, 48";

export function Laser({ onExit }: { onExit: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const stage = cv.parentElement!;
    const ctx = cv.getContext("2d")!;
    const strokes: Stroke[] = [];
    let cur: Stroke | null = null;
    let dot: Pt | null = null;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(stage.clientWidth * dpr);
      cv.height = Math.round(stage.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const at = (e: PointerEvent): Pt => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // 只拦截落在画布上的事件,缩放按钮等浮层照常可点
    const onCanvas = (e: Event) => !!(e.target as Element | null)?.closest?.(".wm-canvas");
    const block = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const guard = (e: Event) => {
      if (onCanvas(e)) block(e);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !onCanvas(e)) return;
      block(e);
      stage.setPointerCapture?.(e.pointerId);
      cur = { pts: [at(e)], end: null };
      strokes.push(cur);
    };
    const move = (e: PointerEvent) => {
      if (!cur && !onCanvas(e)) return void (dot = null);
      block(e);
      dot = at(e);
      if (cur) cur.pts.push(dot);
    };
    const up = (e: PointerEvent) => {
      if (!cur) return;
      block(e);
      cur.end = performance.now();
      cur = null;
    };
    const leave = () => (dot = null);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      block(e);
      onExit();
    };
    const opts = { capture: true };
    stage.addEventListener("pointerdown", down, opts);
    stage.addEventListener("pointermove", move, opts);
    stage.addEventListener("pointerup", up, opts);
    stage.addEventListener("pointercancel", up, opts);
    stage.addEventListener("pointerleave", leave);
    for (const t of ["click", "dblclick", "contextmenu"]) stage.addEventListener(t, guard, opts);
    window.addEventListener("keydown", key, opts);

    const path = (pts: Pt[]) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
      // 用相邻点中点做二次曲线,轨迹更顺滑
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    };

    const frame = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        const a = s.end === null ? 1 : 1 - Math.max(0, now - s.end - HOLD) / FADE;
        if (a <= 0) {
          strokes.splice(i, 1);
          continue;
        }
        path(s.pts);
        ctx.shadowColor = `rgba(${COLOR}, ${a})`;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(${COLOR}, ${0.9 * a})`;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255, 235, 230, ${0.85 * a})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      if (dot) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
        ctx.shadowColor = `rgba(${COLOR}, 1)`;
        ctx.shadowBlur = 16;
        ctx.fillStyle = `rgba(${COLOR}, 0.95)`;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 240, 236, 0.95)";
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    stage.classList.add("wm-laser-on");
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.removeEventListener("pointerdown", down, opts);
      stage.removeEventListener("pointermove", move, opts);
      stage.removeEventListener("pointerup", up, opts);
      stage.removeEventListener("pointercancel", up, opts);
      stage.removeEventListener("pointerleave", leave);
      for (const t of ["click", "dblclick", "contextmenu"]) stage.removeEventListener(t, guard, opts);
      window.removeEventListener("keydown", key, opts);
      stage.classList.remove("wm-laser-on");
    };
  }, [onExit]);

  return <canvas ref={ref} className="wm-laser" />;
}

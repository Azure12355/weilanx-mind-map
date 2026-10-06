import type { MindDoc } from "../../src/core/types";

/** 撤销 / 重做:保存文档快照(不可变对象,结构共享,开销很小) */
export class History {
  private past: MindDoc[] = [];
  private future: MindDoc[] = [];
  constructor(private readonly limit = 200) {}

  push(prev: MindDoc) {
    this.past.push(prev);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: MindDoc): MindDoc | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: MindDoc): MindDoc | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}

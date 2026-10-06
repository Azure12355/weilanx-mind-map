const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 生成 6 位小写 base36 id,保证不与 used 重复,并加入 used */
export function genId(used: Set<string>): string {
  for (;;) {
    let id = "";
    for (let i = 0; i < 6; i++) id += CHARS[Math.floor(Math.random() * 36)];
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

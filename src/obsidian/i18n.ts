import { moment } from "obsidian";

/** 命令名、提示跟随 Obsidian 界面语言 */
export const isZh = () => moment.locale().toLowerCase().startsWith("zh");
export const t = (cn: string, en: string) => (isZh() ? cn : en);

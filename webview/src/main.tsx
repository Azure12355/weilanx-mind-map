import { createRoot } from "react-dom/client";
import { App } from "./App";
import { vscodeHost } from "./host";
import { previewHost } from "./previewHost";
import "./page.css";
import "./style.css";

const host = window.acquireVsCodeApi ? vscodeHost(window.acquireVsCodeApi()) : previewHost();
createRoot(document.getElementById("root")!).render(<App host={host} />);

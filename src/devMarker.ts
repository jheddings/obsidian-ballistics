// devMarker.ts - a small caption under rendered blocks in dev builds, so a
// hot-reloaded bundle can be confirmed at a glance. Inert in production.

import { DEV_BUILD } from "./buildInfo";

export function renderDevMarker(container: HTMLElement, loadedAt: Date): void {
    if (!DEV_BUILD) return;
    container.createDiv({
        cls: "ballistics-dev-marker",
        text: `dev build · loaded ${loadedAt.toLocaleTimeString()}`,
    });
}

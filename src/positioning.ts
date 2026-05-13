// positioning.ts — aligns the rendered copy-button to Obsidian's edit-block
// button, and toggles a hover class on the surrounding code-block wrapper so
// the copy affordance only appears when the user hovers the block.
//
// Obsidian inserts the .edit-block-button into the parent wrapper *after*
// our markdown post-processor returns, so we observe the parent until either
// the button appears (we align and disconnect) or a short timeout elapses.

const ALIGN_TIMEOUT_MS = 3000;
const HOVER_DATA_ATTR = "ballisticsHover";

export interface PositioningHandle {
    /** Mouse-enter handler attached to the wrapper. Caller wires lifecycle. */
    onEnter: () => void;
    /** Mouse-leave handler attached to the wrapper. */
    onLeave: () => void;
    /** Disconnects observers / clears timers. Safe to call repeatedly. */
    dispose: () => void;
}

/**
 * Aligns and lifecycle-binds the copy-button overlay rendered inside `el`.
 * Returns a handle whose hover handlers should be wired via plugin
 * `registerDomEvent` so they unbind on plugin unload.
 *
 * No-ops cleanly if the renderer DOM or parent wrapper is missing.
 */
export function alignCopyOverlay(el: HTMLElement): PositioningHandle | null {
    const block = el.querySelector<HTMLElement>(".ballistics-block");
    const copy = el.querySelector<HTMLElement>(".ballistics-copy");
    const parent = el.parentElement;
    if (!block || !copy || !parent) return null;

    let observer: MutationObserver | null = null;
    let timeoutId: number | null = null;
    let disposed = false;

    const tryAlign = (): boolean => {
        const editBtn = parent.querySelector<HTMLElement>(".edit-block-button");
        if (!editBtn) return false;
        const blockRect = block.getBoundingClientRect();
        const editRect = editBtn.getBoundingClientRect();
        copy.style.top = `${editRect.bottom - blockRect.top + 4}px`;
        copy.style.right = `${blockRect.right - editRect.right}px`;
        return true;
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    if (!tryAlign()) {
        observer = new MutationObserver(() => {
            if (tryAlign()) dispose();
        });
        observer.observe(parent, { childList: true, subtree: true });
        timeoutId = window.setTimeout(dispose, ALIGN_TIMEOUT_MS);
    }

    const onEnter = () => {
        parent.querySelectorAll(".ballistics-copy").forEach((c) => c.classList.add("is-hover"));
    };
    const onLeave = () => {
        parent.querySelectorAll(".ballistics-copy").forEach((c) => c.classList.remove("is-hover"));
    };

    return { onEnter, onLeave, dispose };
}

/**
 * Returns true if the wrapper has already had its hover handlers wired by a
 * prior block. Callers should use this to avoid double-binding when multiple
 * ballistics blocks live in the same parent.
 */
export function hoverAlreadyWired(parent: HTMLElement): boolean {
    if (parent.dataset[HOVER_DATA_ATTR] === "1") return true;
    parent.dataset[HOVER_DATA_ATTR] = "1";
    return false;
}

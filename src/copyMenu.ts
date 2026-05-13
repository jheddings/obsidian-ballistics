// copyMenu.ts — copy-as-markdown/CSV menu attached to a rendered table.

export function toMarkdown(headers: string[], rows: string[][]): string {
    const head = `| ${headers.join(" | ")} |`;
    const sep = `| ${headers.map(() => "---").join(" | ")} |`;
    const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
    return `${head}\n${sep}\n${body}\n`;
}

export function toCsv(headers: string[], rows: string[][]): string {
    const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [headers.map(escape).join(",")];
    for (const r of rows) lines.push(r.map(escape).join(","));
    return lines.join("\n") + "\n";
}

interface MenuEntry {
    label: string;
    serialize: () => string;
}

export function buildCopyMenu(doc: Document, headers: string[], rows: string[][]): HTMLElement {
    const entries: MenuEntry[] = [
        { label: "Copy as Markdown", serialize: () => toMarkdown(headers, rows) },
        { label: "Copy as CSV", serialize: () => toCsv(headers, rows) },
    ];

    const wrap = doc.createElement("div");
    wrap.classList.add("ballistics-copy");

    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.classList.add("clickable-icon", "ballistics-copy-trigger");
    trigger.setAttribute("aria-label", "Copy table");
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.appendChild(clipboardIcon(doc));

    const menu = doc.createElement("div");
    menu.classList.add("ballistics-copy-menu");
    menu.setAttribute("role", "menu");

    let outsideHandler: ((ev: MouseEvent) => void) | null = null;

    const close = () => {
        wrap.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        if (outsideHandler) {
            doc.removeEventListener("mousedown", outsideHandler);
            outsideHandler = null;
        }
    };

    const open = () => {
        wrap.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        outsideHandler = (ev: MouseEvent) => {
            if (!wrap.contains(ev.target as Node)) close();
        };
        doc.addEventListener("mousedown", outsideHandler);
    };

    trigger.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (wrap.classList.contains("is-open")) close();
        else open();
    });

    for (const entry of entries) {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.classList.add("ballistics-copy-item");
        btn.setAttribute("role", "menuitem");
        btn.textContent = entry.label;
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            navigator.clipboard.writeText(entry.serialize()).then(
                () => flash(btn, "Copied"),
                () => flash(btn, "Failed")
            );
            close();
        });
        menu.appendChild(btn);
    }

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    return wrap;
}

function flash(btn: HTMLButtonElement, text: string): void {
    const original = btn.textContent;
    btn.textContent = text;
    window.setTimeout(() => {
        btn.textContent = original;
    }, 900);
}

function clipboardIcon(doc: Document): SVGSVGElement {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "8");
    rect.setAttribute("y", "2");
    rect.setAttribute("width", "8");
    rect.setAttribute("height", "4");
    rect.setAttribute("rx", "1");
    rect.setAttribute("ry", "1");

    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
        "d",
        "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    );

    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
}

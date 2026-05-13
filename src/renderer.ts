// renderer.ts — builds the trajectory table and error-box DOM.

import type { TrajectoryRow } from "./ballistics";
import { labels, type UnitSystem } from "./units";

export interface RenderOptions {
    includeWindage: boolean;
    minEnergy?: number;
    maxEnergy?: number;
}

type RowMark = "max" | "min" | undefined;

export function renderTrajectoryTable(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem,
    options: RenderOptions
): void {
    const lbl = labels(system);
    const doc = container.ownerDocument;

    const headerTop = ["Range", "Elevation", "Elevation", "Elevation"];
    const headerBottom = [`(${lbl.range})`, `(${lbl.linear})`, "(MOA)", "(MIL)"];
    if (options.includeWindage) {
        headerTop.push("Windage", "Windage", "Windage");
        headerBottom.push(`(${lbl.linear})`, "(MOA)", "(MIL)");
    }
    headerTop.push("Time", "Energy", "Velocity");
    headerBottom.push("(s)", `(${lbl.energy})`, `(${lbl.velocity})`);

    const marks = computeBoundMarks(rows, options.minEnergy, options.maxEnergy);
    const bodyCells = rows.map((r) => formatCells(r, options));
    const flatHeaders = headerTop.map((top, i) => `${top} ${headerBottom[i]}`.trim());

    const block = doc.createElement("div");
    block.classList.add("ballistics-block");

    block.appendChild(buildCopyButton(doc, flatHeaders, bodyCells));

    const table = doc.createElement("table");
    table.classList.add("ballistics-table");

    const thead = doc.createElement("thead");
    appendHeaderRow(thead, headerTop);
    appendHeaderRow(thead, headerBottom);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    for (let i = 0; i < rows.length; i++) {
        tbody.appendChild(buildBodyRow(doc, bodyCells[i], marks[i]));
    }
    table.appendChild(tbody);

    block.appendChild(table);
    container.appendChild(block);
}

export function renderError(container: HTMLElement, message: string): void {
    const el = container.ownerDocument.createElement("div");
    el.classList.add("ballistics-error");
    el.textContent = `Ballistics: ${message}`;
    container.appendChild(el);
}

function computeBoundMarks(
    rows: TrajectoryRow[],
    minEnergy: number | undefined,
    maxEnergy: number | undefined
): RowMark[] {
    const marks: RowMark[] = rows.map((): RowMark => undefined);

    if (maxEnergy !== undefined) {
        const idx = rows.findIndex((r) => r.energy <= maxEnergy);
        if (idx !== -1) marks[idx] = "max";
    }
    if (minEnergy !== undefined) {
        let idx = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].energy >= minEnergy) idx = i;
        }
        if (idx !== -1 && marks[idx] === undefined) marks[idx] = "min";
    }
    return marks;
}

function appendHeaderRow(thead: HTMLTableSectionElement, cells: string[]): void {
    const tr = thead.ownerDocument.createElement("tr");
    for (const text of cells) {
        const th = thead.ownerDocument.createElement("th");
        th.scope = "col";
        th.textContent = text;
        tr.appendChild(th);
    }
    thead.appendChild(tr);
}

function formatCells(row: TrajectoryRow, options: RenderOptions): string[] {
    const cells = [
        row.range.toFixed(0),
        row.elevation.toFixed(2),
        row.elevationMoa.toFixed(2),
        row.elevationMil.toFixed(2),
    ];
    if (options.includeWindage) {
        cells.push(row.windage.toFixed(2), row.windageMoa.toFixed(2), row.windageMil.toFixed(2));
    }
    cells.push(row.time.toFixed(3), row.energy.toFixed(0), row.velocity.toFixed(0));
    return cells;
}

function buildBodyRow(doc: Document, cells: string[], mark: RowMark): HTMLTableRowElement {
    const tr = doc.createElement("tr");
    if (mark) tr.classList.add("ballistics-bound", `ballistics-bound-${mark}`);

    for (let i = 0; i < cells.length; i++) {
        const td = doc.createElement("td");
        td.textContent = cells[i];
        if (i === 0 && mark) {
            const arrow = doc.createElement("span");
            arrow.classList.add("ballistics-bound-arrow");
            arrow.textContent = mark === "max" ? " ↓" : " ↑";
            td.appendChild(arrow);
        }
        tr.appendChild(td);
    }
    return tr;
}

function buildCopyButton(doc: Document, headers: string[], rows: string[][]): HTMLElement {
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

    const items: HTMLButtonElement[] = [];
    items.push(
        menuItem(doc, "Copy as Markdown", () => toMarkdown(headers, rows)),
        menuItem(doc, "Copy as CSV", () => toCsv(headers, rows))
    );
    for (const item of items) menu.appendChild(item);

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

    for (const item of items) {
        item.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const serialize = (item as HTMLButtonElement & { _serialize?: () => string })
                ._serialize;
            if (!serialize) return;
            navigator.clipboard.writeText(serialize()).then(
                () => flash(item, "Copied"),
                () => flash(item, "Failed")
            );
            close();
        });
    }

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    return wrap;
}

function menuItem(doc: Document, label: string, serialize: () => string): HTMLButtonElement {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.classList.add("ballistics-copy-item");
    btn.setAttribute("role", "menuitem");
    btn.textContent = label;
    (btn as HTMLButtonElement & { _serialize?: () => string })._serialize = serialize;
    return btn;
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

function toMarkdown(headers: string[], rows: string[][]): string {
    const head = `| ${headers.join(" | ")} |`;
    const sep = `| ${headers.map(() => "---").join(" | ")} |`;
    const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
    return `${head}\n${sep}\n${body}\n`;
}

function toCsv(headers: string[], rows: string[][]): string {
    const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [headers.map(escape).join(",")];
    for (const r of rows) lines.push(r.map(escape).join(","));
    return lines.join("\n") + "\n";
}

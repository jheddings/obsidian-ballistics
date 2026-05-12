// renderer.ts — builds the trajectory table and error-box DOM.

import type { TrajectoryRow } from "./ballistics";
import { labels, type UnitSystem } from "./units";

export function renderTrajectoryTable(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem
): void {
    const lbl = labels(system);
    const doc = container.ownerDocument;

    const table = doc.createElement("table");
    table.classList.add("ballistics-table");

    const thead = doc.createElement("thead");
    appendHeaderRow(thead, [
        "Range",
        "Elevation",
        "Elevation",
        "Elevation",
        "Windage",
        "Windage",
        "Windage",
        "Time",
        "Energy",
        "Velocity",
    ]);
    appendHeaderRow(thead, [
        `(${lbl.range})`,
        `(${lbl.linear})`,
        "(MOA)",
        "(MIL)",
        `(${lbl.linear})`,
        "(MOA)",
        "(MIL)",
        "(s)",
        `(${lbl.energy})`,
        `(${lbl.velocity})`,
    ]);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    for (const row of rows) {
        tbody.appendChild(formatRow(doc, row));
    }
    table.appendChild(tbody);

    container.appendChild(table);
}

export function renderError(container: HTMLElement, message: string): void {
    const el = container.ownerDocument.createElement("div");
    el.classList.add("ballistics-error");
    el.textContent = `Ballistics: ${message}`;
    container.appendChild(el);
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

function formatRow(doc: Document, row: TrajectoryRow): HTMLTableRowElement {
    const tr = doc.createElement("tr");
    const cells = [
        row.range.toFixed(0),
        row.elevation.toFixed(2),
        row.elevationMoa.toFixed(2),
        row.elevationMil.toFixed(2),
        row.windage.toFixed(2),
        row.windageMoa.toFixed(2),
        row.windageMil.toFixed(2),
        row.time.toFixed(3),
        row.energy.toFixed(0),
        row.velocity.toFixed(0),
    ];
    for (const text of cells) {
        const td = doc.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    }
    return tr;
}

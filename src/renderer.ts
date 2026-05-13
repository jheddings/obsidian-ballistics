// renderer.ts — builds the trajectory table and error-box DOM.

import type { TrajectoryRow } from "./ballistics";
import { labels, type UnitLabels, type UnitSystem } from "./units";
import { buildCopyMenu } from "./copyMenu";

export interface RenderOptions {
    includeWindage: boolean;
    minEnergy?: number;
    maxEnergy?: number;
}

type RowMark = "max" | "min" | undefined;

interface ColumnSpec {
    top: string;
    /** Bottom-row label, expressed as a function of the unit-label table. */
    bottom: (lbl: UnitLabels) => string;
    format: (row: TrajectoryRow) => string;
    /** If present and returns false, the column is omitted. */
    when?: (options: RenderOptions) => boolean;
}

const COLUMNS: readonly ColumnSpec[] = [
    {
        top: "Range",
        bottom: (l) => `(${l.range})`,
        format: (r) => r.range.toFixed(0),
    },
    {
        top: "Elevation",
        bottom: (l) => `(${l.linear})`,
        format: (r) => r.elevation.toFixed(2),
    },
    {
        top: "Elevation",
        bottom: () => "(MOA)",
        format: (r) => r.elevationMoa.toFixed(2),
    },
    {
        top: "Elevation",
        bottom: () => "(MIL)",
        format: (r) => r.elevationMil.toFixed(2),
    },
    {
        top: "Windage",
        bottom: (l) => `(${l.linear})`,
        format: (r) => r.windage.toFixed(2),
        when: (o) => o.includeWindage,
    },
    {
        top: "Windage",
        bottom: () => "(MOA)",
        format: (r) => r.windageMoa.toFixed(2),
        when: (o) => o.includeWindage,
    },
    {
        top: "Windage",
        bottom: () => "(MIL)",
        format: (r) => r.windageMil.toFixed(2),
        when: (o) => o.includeWindage,
    },
    {
        top: "Time",
        bottom: () => "(s)",
        format: (r) => r.time.toFixed(3),
    },
    {
        top: "Energy",
        bottom: (l) => `(${l.energy})`,
        format: (r) => r.energy.toFixed(0),
    },
    {
        top: "Velocity",
        bottom: (l) => `(${l.velocity})`,
        format: (r) => r.velocity.toFixed(0),
    },
];

export function renderTrajectoryTable(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem,
    options: RenderOptions
): void {
    const lbl = labels(system);
    const doc = container.ownerDocument;

    const columns = COLUMNS.filter((c) => !c.when || c.when(options));
    const headerTop = columns.map((c) => c.top);
    const headerBottom = columns.map((c) => c.bottom(lbl));
    const bodyCells = rows.map((r) => columns.map((c) => c.format(r)));
    const flatHeaders = headerTop.map((top, i) => `${top} ${headerBottom[i]}`.trim());

    const marks = computeBoundMarks(rows, options.minEnergy, options.maxEnergy);

    const block = doc.createElement("div");
    block.classList.add("ballistics-block");

    block.appendChild(buildCopyMenu(doc, flatHeaders, bodyCells));

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

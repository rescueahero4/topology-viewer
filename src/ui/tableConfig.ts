import { partConfig } from "./custom";
import type { InputKind } from "./cellEdit";
import type { Column } from "./workbenchColumns";
import type { Row } from "./workbenchRows";

// The `columns` option of the `table` part, read by the columns, the cells and the editors.

export type ColumnEditor =
  | InputKind
  | { select: readonly string[]; message?: string };

export type ColumnConfig = {
  core?: string;
  attr?: string;
  label?: string;
  hidden?: boolean;
  editable?: boolean | ((row: unknown) => boolean);
  editor?: ColumnEditor;
  value?: (row: unknown) => unknown;
  format?: (value: unknown, row: unknown) => string;
};

export function columnConfigs(): readonly ColumnConfig[] {
  const given = partConfig("table")?.options?.columns;
  return Array.isArray(given) ? (given as ColumnConfig[]) : [];
}

export function columnConfig(column: Column): ColumnConfig | undefined {
  return columnConfigs().find((one) =>
    "core" in column ? one.core === column.core : one.attr === column.attr,
  );
}

export const columnsOnly = () =>
  partConfig("table")?.options?.columnsOnly === true;

export function publicColumn(column: Column): string | { attr: string } {
  return "core" in column ? column.core : { attr: column.attr };
}

/** The public form of a table row. */
export function publicRow(row: Row): Readonly<Record<string, unknown>> {
  return row.rtype === "node"
    ? {
        kind: "node",
        id: row.entity,
        record: row.id,
        label: row.record.label,
        type: row.record.type,
        attrs: row.record.attrs,
      }
    : {
        kind: "edge",
        subject: row.subject,
        predicate: row.predicate,
        object: row.triple.object,
        attrs: row.triple.attrs,
      };
}

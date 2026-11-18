import type { PickleTable } from '@cucumber/messages';

// the package is built twice (`adapter` and `adapter/js`), each with its own DataTable class:
// a shared brand makes `instanceof DataTable` hold whichever build created the table
const DATA_TABLE_BRAND = Symbol.for('@qavajs/playwright-runner-adapter/DataTable');

/**
 * Data table passed to a step (Cucumber compatible)
 */
export class DataTable {
    static [Symbol.hasInstance](value: unknown): boolean {
        return typeof value === 'object' && value !== null && DATA_TABLE_BRAND in value;
    }

    private readonly rawTable: string[][];

    constructor(sourceTable: string[][] | Pick<PickleTable, 'rows'>) {
        this.rawTable = Array.isArray(sourceTable)
            ? sourceTable
            : sourceTable.rows.map(row => row.cells.map(cell => cell.value));
    }

    /**
     * Rows as objects keyed by the first row
     */
    hashes(): Record<string, string>[] {
        const [keys, ...rows] = this.raw();
        return rows.map(values => Object.fromEntries(keys.map((key, index) => [key, values[index]])));
    }

    /**
     * All rows including the first one
     */
    raw(): string[][] {
        return this.rawTable.slice(0);
    }

    /**
     * Rows without the first one
     */
    rows(): string[][] {
        return this.raw().slice(1);
    }

    /**
     * Object of two column table: first column as keys, second as values
     */
    rowsHash(): Record<string, string> {
        const rows = this.raw();
        if (!rows.every(row => row.length === 2)) {
            throw new Error('rowsHash can only be called on a data table where all rows have exactly two columns');
        }
        return Object.fromEntries(rows);
    }

    transpose(): DataTable {
        const transposed = (this.rawTable[0] ?? []).map((_, i) => this.rawTable.map(row => row[i]));
        return new DataTable(transposed);
    }
}

Object.defineProperty(DataTable.prototype, DATA_TABLE_BRAND, { value: true });

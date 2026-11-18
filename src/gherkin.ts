import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { CucumberExpressionGenerator, type GeneratedExpression } from '@cucumber/cucumber-expressions';
import type {
    GherkinDocument,
    PickleDocString,
    PickleStep,
    PickleStepArgument,
    PickleTable,
    Scenario,
    Step
} from '@cucumber/messages';
import { DataTable } from './dataTable';
import type { SupportCodeLibrary } from './types';

export interface SourceLocation {
    file: string;
    line: number;
    column: number;
}

export type Position = Omit<SourceLocation, 'file'>;

const PREVIEW_LENGTH = 50;

/**
 * Map ast node ids (scenarios, steps, example rows, rules) of a gherkin document to their positions
 */
export function collectPositions(gherkinDocument: GherkinDocument): Map<string, Position> {
    const positions = new Map<string, Position>();
    const addSteps = (steps: readonly Step[]) => {
        for (const step of steps) positions.set(step.id, step.location as Position);
    };
    const addScenario = (scenario: Scenario) => {
        positions.set(scenario.id, scenario.location as Position);
        addSteps(scenario.steps);
        for (const examples of scenario.examples) {
            for (const row of examples.tableBody) positions.set(row.id, row.location as Position);
        }
    };
    for (const child of gherkinDocument.feature?.children ?? []) {
        if (child.background) addSteps(child.background.steps);
        if (child.scenario) addScenario(child.scenario);
        if (child.rule) {
            for (const ruleChild of child.rule.children) {
                if (ruleChild.background) addSteps(ruleChild.background.steps);
                if (ruleChild.scenario) addScenario(ruleChild.scenario);
            }
        }
    }
    return positions;
}

/**
 * Resolve location of a pickle or pickle step.
 * The last ast node id is used, so scenario outline examples point to their example row.
 */
export function resolveLocation(
    positions: Map<string, Position>,
    file: string,
    astNodeIds: readonly string[]
): SourceLocation | undefined {
    for (let i = astNodeIds.length - 1; i >= 0; i--) {
        const position = positions.get(astNodeIds[i]);
        if (position) return { file, line: position.line, column: position.column ?? 1 };
    }
    return undefined;
}

/**
 * Location of the code that called `fn`, e.g. the `defineConfig(...)` call in the config file
 */
export function callerLocation(fn: (...args: any[]) => unknown): SourceLocation | undefined {
    const originalPrepare = Error.prepareStackTrace;
    const holder: { stack?: NodeJS.CallSite[] } = {};
    try {
        Error.prepareStackTrace = (_, callSites) => callSites;
        Error.captureStackTrace(holder, fn);
        const callSite = holder.stack?.[0];
        const file = callSite?.getFileName();
        if (!callSite || !file) return undefined;
        return {
            file: file.startsWith('file://') ? fileURLToPath(file) : file,
            line: callSite.getLineNumber() ?? 1,
            column: callSite.getColumnNumber() ?? 1
        };
    } finally {
        Error.prepareStackTrace = originalPrepare;
    }
}

/**
 * Call function so that the immediate caller frame reports the given source location.
 * Playwright takes test and describe locations from the caller frame.
 */
export function callAt<T>(location: SourceLocation | undefined, fn: (...args: any[]) => T, args: unknown[]): T {
    if (!location) return fn(...args);
    return callerAt(location)(fn, args) as T;
}

type Caller = (fn: (...args: any[]) => unknown, args: unknown[]) => unknown;

const CALLER_CODE = '(function (fn, args) { return fn(...args); })';
const CALL_COLUMN = CALLER_CODE.indexOf('fn(...args)');
/** compiled callers by location; all tests of a config are located at the same `defineConfig` call */
const callers = new Map<string, Caller>();

function callerAt(location: SourceLocation): Caller {
    const key = `${location.file}:${location.line}:${location.column}`;
    let caller = callers.get(key);
    if (!caller) {
        caller = runInThisContext(CALLER_CODE, {
            filename: location.file,
            lineOffset: location.line - 1,
            columnOffset: location.column - 1 - CALL_COLUMN
        }) as Caller;
        callers.set(key, caller);
    }
    return caller;
}

function preview(text: string): string {
    const singleLine = text
        .replace(/\s*\n\s*/g, ' ↵ ')
        .replace(/\s+/g, ' ')
        .trim();
    return singleLine.length > PREVIEW_LENGTH ? `${singleLine.slice(0, PREVIEW_LENGTH - 1)}…` : singleLine;
}

/**
 * Build step title for reports including short preview of doc string or data table argument
 */
export function stepTitle(pickleStep: Pick<PickleStep, 'text' | 'argument'>): string {
    const argument = pickleStep.argument;
    if (argument?.docString) {
        return `${pickleStep.text} [MultiLine: ${preview(argument.docString.content)}]`;
    }
    if (argument?.dataTable) {
        const rows = argument.dataTable.rows
            .map(row => `| ${row.cells.map(cell => cell.value).join(' | ')} |`)
            .join(' ');
        return `${pickleStep.text} [DataTable: ${preview(rows)}]`;
    }
    return pickleStep.text;
}

function isTable(value: unknown): value is unknown[][] {
    return Array.isArray(value) && value.every(row => Array.isArray(row));
}

/**
 * Convert value passed to executeStep into a pickle step argument.
 * Strings become doc strings, `string[][]` and DataTable instances become data tables.
 */
export function toPickleArgument(value: unknown): { argument?: PickleStepArgument; extra?: unknown } {
    if (typeof value === 'string') {
        return { argument: { docString: { content: value } } };
    }
    const rows = value instanceof DataTable ? value.raw() : isTable(value) ? value : undefined;
    if (rows) {
        return {
            argument: {
                dataTable: {
                    rows: rows.map(row => ({ cells: row.map(cell => ({ value: String(cell) })) }))
                }
            }
        };
    }
    return { extra: value };
}

/**
 * Map doc string and / or data table of a step, in the order they appear in the source
 * (data table first when the order is not known)
 */
export function parseStepArguments<T>(
    argument: PickleStepArgument | undefined,
    mapping: { dataTable: (table: PickleTable) => T; docString: (docString: PickleDocString) => T }
): T[] {
    type Indexed = { argumentIndex?: number };
    const order = (value: Indexed) => value.argumentIndex ?? Number.MAX_SAFE_INTEGER;
    const items: { index: number; value: () => T }[] = [];
    if (argument?.dataTable) {
        const table = argument.dataTable;
        items.push({ index: order(table as Indexed), value: () => mapping.dataTable(table) });
    }
    if (argument?.docString) {
        const docString = argument.docString;
        items.push({ index: order(docString as Indexed), value: () => mapping.docString(docString) });
    }
    return items.sort((a, b) => a.index - b.index).map(item => item.value());
}

const SNIPPET_FUNCTIONS: Record<string, string> = {
    Context: 'Given',
    Action: 'When',
    Outcome: 'Then'
};

const SNIPPET_COMMENT = 'Write code here that turns the phrase above into concrete actions';

function snippetPattern(expression: GeneratedExpression): string {
    return expression.source.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Build cucumber-style snippet for undefined step.
 * Alternative expressions (e.g. `{int}` or `{float}` for a number) are listed as comments.
 */
export function buildSnippet(
    supportCodeLibrary: Pick<SupportCodeLibrary, 'parameterTypeRegistry'>,
    pickleStep: Pick<PickleStep, 'text' | 'argument'> & Partial<PickleStep>
): string | undefined {
    const registry = supportCodeLibrary.parameterTypeRegistry;
    const generator = new CucumberExpressionGenerator(() => registry.parameterTypes);
    const expressions = generator.generateExpressions(pickleStep.text);
    if (expressions.length === 0) return undefined;
    const functionName = SNIPPET_FUNCTIONS[pickleStep.type ?? ''] ?? 'Given';
    const argumentNames = parseStepArguments(pickleStep.argument, {
        dataTable: () => 'dataTable',
        docString: () => 'docString'
    });
    const definitions = expressions.map((expression, index) => {
        const parameters = [...expression.parameterNames, ...argumentNames].join(', ');
        const prefix = index === 0 ? '' : '// ';
        return `${prefix}${functionName}('${snippetPattern(expression)}', async function (${parameters}) {\n`;
    });
    return `${definitions.join('')}  // ${SNIPPET_COMMENT}\n  return 'pending';\n});`;
}

export function formatLocation(location?: SourceLocation): string {
    return location ? `${location.file}:${location.line}` : '';
}

/**
 * Feature title used for describe block; falls back to file path for unnamed features
 */
export function featureTitle(name: string | undefined, uri: string): string {
    return name?.trim() ? name : uri;
}

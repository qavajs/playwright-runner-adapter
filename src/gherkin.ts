import { runInThisContext } from 'node:vm';
import { DataTable } from '@cucumber/cucumber';
import type { GherkinDocument, PickleStep, PickleStepArgument, Scenario, Step } from '@cucumber/messages';
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
 * Call function so that the immediate caller frame reports the given source location.
 * Playwright takes test and describe locations from the caller frame,
 * so this makes reports, `--list` and IDE integrations point to the feature file instead of the adapter.
 */
export function callAt<T>(location: SourceLocation | undefined, fn: (...args: any[]) => T, args: unknown[]): T {
    if (!location) return fn(...args);
    const code = '(function (fn, args) { return fn(...args); })';
    const callColumn = code.indexOf('fn(...args)');
    const caller = runInThisContext(code, {
        filename: location.file,
        lineOffset: location.line - 1,
        columnOffset: location.column - 1 - callColumn
    });
    return caller(fn, args);
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

const KEYWORD_TYPES: Record<string, string> = {
    Context: 'precondition',
    Action: 'event',
    Outcome: 'outcome'
};

/**
 * Build cucumber-style snippet for undefined step
 */
export function buildSnippet(
    supportCodeLibrary: Pick<SupportCodeLibrary, 'parameterTypeRegistry'>,
    pickleStep: PickleStep
): string | undefined {
    try {
        const {
            default: SnippetBuilder
        } = require('@cucumber/cucumber/lib/formatter/step_definition_snippet_builder/index');
        const {
            default: SnippetSyntax
        } = require('@cucumber/cucumber/lib/formatter/step_definition_snippet_builder/javascript_snippet_syntax');
        const builder = new SnippetBuilder({
            snippetSyntax: new SnippetSyntax('async-await'),
            parameterTypeRegistry: supportCodeLibrary.parameterTypeRegistry
        });
        return builder.build({
            keywordType: KEYWORD_TYPES[pickleStep.type ?? ''] ?? 'precondition',
            pickleStep
        });
    } catch {
        return undefined;
    }
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

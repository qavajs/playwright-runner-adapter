import { readFileSync } from 'node:fs';
import type { GherkinDocument, Pickle, PickleStep, Scenario, Step, TableRow, Tag } from '@cucumber/messages';
import { stepTitle } from './gherkin';
import { SKIPPED_BY_STEP_REASON } from './scenarioRunner';
import type { Feature } from './types';

/*
 * Cucumber JSON format (as written by cucumber-js `--format json`), read by
 * cucumber-html-reporter, multiple-cucumber-html-reporter, Jenkins cucumber reports, Xray and others.
 */

export type JsonStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'undefined' | 'ambiguous';

export interface JsonTag {
    name: string;
    line: number;
}

export interface JsonEmbedding {
    data: string;
    mime_type: string;
}

export interface JsonStep {
    keyword: string;
    name?: string;
    line?: number;
    /** hooks are hidden steps */
    hidden?: true;
    arguments?: ({ content: string; line?: number } | { rows: { cells: string[] }[] })[];
    match?: { location: string };
    result: { status: JsonStatus; duration?: number; error_message?: string };
    embeddings?: JsonEmbedding[];
}

export interface JsonScenario {
    id: string;
    keyword: string;
    name: string;
    description: string;
    line: number;
    type: 'scenario';
    tags: JsonTag[];
    steps: JsonStep[];
}

export interface JsonFeature {
    uri: string;
    id: string;
    keyword: string;
    name: string;
    description: string;
    line: number;
    tags: JsonTag[];
    elements: JsonScenario[];
}

/** the parts of Playwright's `TestError` used in the report */
export interface ReportedError {
    message?: string;
    stack?: string;
    value?: string;
}

/** the parts of Playwright's reporter `TestStep` used in the report */
export interface ReportedStep {
    title: string;
    category: string;
    duration: number;
    error?: ReportedError;
    location?: { file: string; line: number };
    annotations: readonly { type: string; description?: string }[];
    attachments: readonly { name: string; contentType: string; path?: string; body?: Buffer }[];
    steps: readonly ReportedStep[];
}

/** final attempt of a scenario */
export interface ScenarioReport {
    /** Playwright project name */
    project: string;
    /** pickle uri (feature file path relative to the working directory) */
    uri: string;
    /** pickle name */
    name: string;
    status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
    error?: ReportedError;
    /** test and runtime annotations */
    annotations: readonly { type: string; description?: string }[];
    steps: readonly ReportedStep[];
}

const LOG_ATTACHMENT = { name: 'log', contentType: 'text/plain' };
const CUCUMBER_LOG_MEDIA_TYPE = 'text/x.cucumber.log+plain';
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape codes
const ANSI = /\u001b\[[0-9;]*m/g;
// messages of errors thrown by ScenarioRunner for these statuses
const STATUS_MESSAGES: [RegExp, JsonStatus][] = [
    [/^(?:\w*Error: )?Step '.*' is not defined$/m, 'undefined'],
    [/^(?:\w*Error: )?Step '.*' matches multiple step definitions:$/m, 'ambiguous'],
    [/^(?:\w*Error: )?Step '.*' is pending$/m, 'pending']
];

function toId(name: string): string {
    return name.replace(/ /g, '-').toLowerCase();
}

function errorText(error: ReportedError | undefined): string | undefined {
    const text = error?.stack ?? error?.message ?? error?.value;
    return text?.replace(ANSI, '');
}

function errorStatus(error: ReportedError): JsonStatus {
    const message = (error.message ?? error.value ?? '').replace(ANSI, '');
    return STATUS_MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? 'failed';
}

interface AstIndex {
    scenarios: Map<string, Scenario>;
    steps: Map<string, Step>;
    rows: Map<string, TableRow>;
    tags: Map<string, Tag>;
}

function indexAst(gherkinDocument: GherkinDocument): AstIndex {
    const index: AstIndex = { scenarios: new Map(), steps: new Map(), rows: new Map(), tags: new Map() };
    const addTags = (tags: readonly Tag[]) => {
        for (const tag of tags) index.tags.set(tag.id, tag);
    };
    const addSteps = (steps: readonly Step[]) => {
        for (const step of steps) index.steps.set(step.id, step);
    };
    const addScenario = (scenario: Scenario) => {
        index.scenarios.set(scenario.id, scenario);
        addTags(scenario.tags);
        addSteps(scenario.steps);
        for (const examples of scenario.examples) {
            addTags(examples.tags);
            for (const row of examples.tableBody) index.rows.set(row.id, row);
        }
    };
    const feature = gherkinDocument.feature;
    addTags(feature?.tags ?? []);
    for (const child of feature?.children ?? []) {
        if (child.background) addSteps(child.background.steps);
        if (child.scenario) addScenario(child.scenario);
        if (child.rule) {
            addTags(child.rule.tags);
            for (const ruleChild of child.rule.children) {
                if (ruleChild.background) addSteps(ruleChild.background.steps);
                if (ruleChild.scenario) addScenario(ruleChild.scenario);
            }
        }
    }
    return index;
}

function collectAttachments(step: ReportedStep): ReportedStep['attachments'][number][] {
    return [...step.attachments, ...step.steps.flatMap(collectAttachments)];
}

function embeddings(step: ReportedStep): JsonEmbedding[] | undefined {
    const result: JsonEmbedding[] = [];
    for (const attachment of collectAttachments(step)) {
        let body = attachment.body;
        if (!body && attachment.path) {
            try {
                body = readFileSync(attachment.path);
            } catch {
                continue;
            }
        }
        if (!body) continue;
        const isLog = attachment.name === LOG_ATTACHMENT.name && attachment.contentType === LOG_ATTACHMENT.contentType;
        result.push({
            data: body.toString('base64'),
            mime_type: isLog ? CUCUMBER_LOG_MEDIA_TYPE : attachment.contentType
        });
    }
    return result.length > 0 ? result : undefined;
}

function hasSoftError(step: ReportedStep): boolean {
    return step.steps.some(child => (child.category === 'expect' && !!child.error) || hasSoftError(child));
}

function stepResult(step: ReportedStep, scenario: ScenarioReport): JsonStep['result'] {
    const duration = Math.round(step.duration * NANOSECONDS_PER_MILLISECOND);
    if (step.annotations.some(annotation => annotation.type === 'skip')) return { status: 'skipped', duration };
    if (step.error) {
        // `test.skip()` called in a step throws, but skips the scenario
        if (scenario.status === 'skipped') return { status: 'skipped', duration };
        return { status: errorStatus(step.error), duration, error_message: errorText(step.error) };
    }
    if (scenario.status !== 'passed' && hasSoftError(step)) {
        const softError = step.steps.find(child => child.error)?.error;
        return { status: 'failed', duration, error_message: errorText(softError) };
    }
    return { status: 'passed', duration };
}

function location(step: ReportedStep): { location: string } | undefined {
    return step.location ? { location: `${step.location.file}:${step.location.line}` } : undefined;
}

function hookStep(keyword: 'Before' | 'After', step: ReportedStep, scenario: ScenarioReport): JsonStep {
    return {
        keyword,
        ...(step.title === keyword ? {} : { name: step.title }),
        hidden: true,
        ...(location(step) ? { match: location(step) } : {}),
        result: stepResult(step, scenario),
        ...(embeddings(step) ? { embeddings: embeddings(step) } : {})
    };
}

function gherkinStep(
    pickleStep: PickleStep,
    index: AstIndex,
    step: ReportedStep | undefined,
    scenario: ScenarioReport
): JsonStep {
    const astStep = index.steps.get(pickleStep.astNodeIds[0]);
    const argument = pickleStep.argument;
    const args: NonNullable<JsonStep['arguments']> = [];
    if (argument?.docString) {
        args.push({ content: argument.docString.content, line: astStep?.docString?.location.line });
    }
    if (argument?.dataTable) {
        args.push({ rows: argument.dataTable.rows.map(row => ({ cells: row.cells.map(cell => cell.value) })) });
    }
    const match = step && location(step);
    const stepEmbeddings = step && embeddings(step);
    return {
        keyword: astStep?.keyword ?? '',
        name: pickleStep.text,
        line: astStep?.location.line,
        arguments: args,
        ...(match ? { match } : {}),
        // steps not reported at all didn't run, e.g. after a failure in fixtures or a timeout
        result: step ? stepResult(step, scenario) : { status: 'skipped', duration: 0 },
        ...(stepEmbeddings ? { embeddings: stepEmbeddings } : {})
    };
}

/**
 * Split top level `test.step`s of a scenario into Before hooks, gherkin steps and After hooks.
 * Gherkin steps are reported in order with titles built by `stepTitle`; anything before the first one
 * is a Before hook, anything after is an After hook (BeforeStep / AfterStep hooks are nested in steps).
 */
function assignSteps(pickle: Pickle, steps: readonly ReportedStep[]) {
    const titles = pickle.steps.map(stepTitle);
    const before: ReportedStep[] = [];
    const after: ReportedStep[] = [];
    const matched: (ReportedStep | undefined)[] = new Array(titles.length).fill(undefined);
    let next = 0;
    for (const step of steps) {
        if (step.category !== 'test.step') continue;
        if (next < titles.length && step.title === titles[next]) {
            matched[next++] = step;
        } else {
            (next === 0 ? before : after).push(step);
        }
    }
    return { before, matched, after };
}

/**
 * A step or Before hook returning `'skipped'` / `'pending'` (non-strict) doesn't fail its Playwright step;
 * the scenario is skipped or marked fixme instead. Apply the status to the last executed step or Before hook.
 */
function applyScenarioStatus(executed: JsonStep[], scenario: ScenarioReport): void {
    const fixme = scenario.annotations.find(
        annotation => annotation.type === 'fixme' && STATUS_MESSAGES[2][0].test(annotation.description ?? '')
    );
    const skipped = scenario.annotations.some(
        annotation => annotation.type === 'skip' && annotation.description === SKIPPED_BY_STEP_REASON
    );
    const status: JsonStatus | undefined = fixme ? 'pending' : skipped ? 'skipped' : undefined;
    if (!status) return;
    const last = executed.findLast(step => step.result.status === 'passed');
    if (last) last.result = { ...last.result, status, ...(fixme ? { error_message: fixme.description } : {}) };
}

function buildScenario(pickle: Pickle, index: AstIndex, featureId: string, scenario: ScenarioReport): JsonScenario {
    const astScenario = index.scenarios.get(pickle.astNodeIds[0]);
    const row = index.rows.get(pickle.astNodeIds[pickle.astNodeIds.length - 1]);
    const { before, matched, after } = assignSteps(pickle, scenario.steps);
    const beforeSteps = before.map(step => hookStep('Before', step, scenario));
    const gherkinSteps = pickle.steps.map((pickleStep, i) => gherkinStep(pickleStep, index, matched[i], scenario));
    const afterSteps = after.map(step => hookStep('After', step, scenario));

    const executed = [...beforeSteps, ...gherkinSteps.filter((_, i) => matched[i])];
    applyScenarioStatus(executed, scenario);

    // failures outside of reported steps, e.g. in fixtures, world `init` or a test timeout
    const allSteps = [...beforeSteps, ...gherkinSteps, ...afterSteps];
    const failed = scenario.status === 'failed' || scenario.status === 'timedOut';
    if (failed && !allSteps.some(step => step.result.status !== 'passed' && step.result.status !== 'skipped')) {
        const failure: JsonStep = {
            keyword: executed.length === 0 ? 'Before' : 'After',
            hidden: true,
            result: { status: 'failed', duration: 0, error_message: errorText(scenario.error) }
        };
        if (executed.length === 0) beforeSteps.push(failure);
        else afterSteps.push(failure);
    }

    return {
        id: `${featureId};${toId(pickle.name)}`,
        keyword: astScenario?.keyword ?? 'Scenario',
        name: pickle.name,
        description: astScenario?.description ?? '',
        line: (row ?? astScenario)?.location.line ?? 0,
        type: 'scenario',
        tags: pickle.tags.map(tag => ({ name: tag.name, line: index.tags.get(tag.astNodeId)?.location.line ?? 0 })),
        steps: [...beforeSteps, ...gherkinSteps, ...afterSteps]
    };
}

/**
 * Build a Cucumber JSON feature from a parsed feature file and the results of its scenarios.
 * Scenarios are matched by pickle name, which is unique within a feature file; elements follow the file order.
 */
export function buildFeatureJson(feature: Feature, uri: string, scenarios: readonly ScenarioReport[]): JsonFeature {
    const gherkinFeature = feature.gherkinDocument.feature;
    const index = indexAst(feature.gherkinDocument);
    const featureId = toId(gherkinFeature?.name ?? uri);
    const byName = new Map(scenarios.map(scenario => [scenario.name, scenario]));
    const elements = feature.tests.flatMap(pickle => {
        const scenario = byName.get(pickle.name);
        return scenario ? [buildScenario(pickle, index, featureId, scenario)] : [];
    });
    return {
        uri,
        id: featureId,
        keyword: gherkinFeature?.keyword ?? 'Feature',
        name: gherkinFeature?.name ?? '',
        description: gherkinFeature?.description ?? '',
        line: gherkinFeature?.location.line ?? 1,
        tags: (gherkinFeature?.tags ?? []).map(tag => ({ name: tag.name, line: tag.location.line })),
        elements
    };
}

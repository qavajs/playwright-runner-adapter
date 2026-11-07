import { relative } from 'node:path';
import { Readable } from 'node:stream';
import { inspect } from 'node:util';
import { parseTagExpression } from './filter';
import { load } from './loader';
import { resolveRetries, resolveTestDetails } from './testDetails';
import { resolveTimeout, runWithTimeout } from './timeout';
import {
    buildSnippet,
    callAt,
    collectPositions,
    featureTitle,
    formatLocation,
    resolveLocation,
    stepTitle,
    type SourceLocation
} from './gherkin';
import type { TestInfo, TestType } from '@playwright/test';
import type { ITestCaseHookParameter } from '@cucumber/cucumber';
import type { Pickle, PickleStep } from '@cucumber/messages';
import type {
    AttachData,
    AttachOptions,
    CucumberAdapterConfig,
    Feature,
    HookDefinition,
    HookResult,
    StepDefinitionMatch,
    SupportCodeLibrary,
    WorldBase
} from './types';

type AnyTestType = TestType<Record<string, unknown>, Record<string, unknown>>;

const HOOK_NAMES = {
    BEFORE_ALL: 'Before All',
    AFTER_ALL: 'After All',
    BEFORE: 'Before',
    AFTER: 'After',
    BEFORE_STEP: 'Before Step',
    AFTER_STEP: 'After Step',
} as const;

const DEFAULT_VALUES = {
    ATTACHMENT_FILENAME: 'attachment',
    LOG_ATTACHMENT_NAME: 'log',
    TEXT_CONTENT_TYPE: 'text/plain',
    BINARY_CONTENT_TYPE: 'application/octet-stream',
    COLUMN: 1,
    TEST_CASE_ID: '0',
    TEST_STEP_ID: '0'
} as const;

const BASE64_SUFFIX = ';base64';

type ExecutionStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'undefined' | 'ambiguous';

interface TestExecutionResult {
    status: ExecutionStatus;
    error?: Error;
    start: number;
}

/**
 * Error raised for undefined, ambiguous and pending steps
 */
class StepStatusError extends Error {
    constructor(message: string, readonly status: ExecutionStatus) {
        super(message);
        this.name = 'StepStatusError';
    }
}

function getLine(step: Pick<HookDefinition, 'uri' | 'line'>): { location?: SourceLocation } {
    if (!step.uri) return {};
    return {
        location: {
            column: DEFAULT_VALUES.COLUMN,
            file: step.uri,
            line: step.line
        }
    };
}

/**
 * Log data to the report as `log` attachment of the current step (same as cucumber `this.log`)
 */
function log(this: { test: { info: () => TestInfo } }, data: unknown): void {
    const body = typeof data === 'string' ? data : inspect(data);
    this.test.info()
        .attach(DEFAULT_VALUES.LOG_ATTACHMENT_NAME, { body, contentType: DEFAULT_VALUES.TEXT_CONTENT_TYPE })
        .catch(() => console.log(body));
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/**
 * Attach data to the report. Compatible with cucumber `this.attach`:
 * - `attach(data, 'image/png')` or `attach(data, { mediaType, fileName })`
 * - `attach(base64String, 'image/png;base64')` decodes base64 data
 * - readable streams are buffered
 */
async function attach(
    this: { test: { info: () => TestInfo } },
    data: AttachData,
    mediaTypeOrOptions?: string | AttachOptions
): Promise<void> {
    const options: AttachOptions = typeof mediaTypeOrOptions === 'string'
        ? { mediaType: mediaTypeOrOptions }
        : mediaTypeOrOptions ?? {};
    let body: string | Buffer = data instanceof Readable ? await streamToBuffer(data) : data;
    let contentType = options.mediaType;
    if (contentType?.endsWith(BASE64_SUFFIX)) {
        contentType = contentType.slice(0, -BASE64_SUFFIX.length);
        if (typeof body === 'string') body = Buffer.from(body, 'base64');
    }
    contentType ??= typeof body === 'string' ? DEFAULT_VALUES.TEXT_CONTENT_TYPE : DEFAULT_VALUES.BINARY_CONTENT_TYPE;
    const fileName = options.fileName ?? DEFAULT_VALUES.ATTACHMENT_FILENAME;
    return this.test.info().attach(fileName, { body, contentType });
}

function createTestExecutionResult(): TestExecutionResult {
    return {
        status: 'passed',
        start: Date.now()
    };
}

function createHookResult(result: TestExecutionResult): HookResult {
    return {
        duration: Date.now() - result.start,
        message: result.error?.message,
        status: result.status.toUpperCase(),
        exception: result.error
    };
}

function createCaseHookPayload(feature: Feature, testCase: Pickle): Pick<ITestCaseHookParameter, 'gherkinDocument' | 'pickle'> & { testCaseStartedId: string } {
    return {
        gherkinDocument: feature.gherkinDocument,
        pickle: testCase,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID
    };
}

/**
 * Invoke hook code applying `{ timeout }` option or default timeout
 */
function invokeHook(hook: HookDefinition, thisArg: unknown, args: unknown[], hookName: string, defaultTimeout?: number): Promise<unknown> {
    return runWithTimeout(
        () => hook.code.apply(thisArg, args),
        resolveTimeout(hook, defaultTimeout),
        `${hookName} hook timed out after {timeout} ms\n  at ${hook.uri}:${hook.line}`
    );
}

/**
 * Execute hooks applicable to the test case.
 * @returns `'skipped'` if any hook returned `'skipped'` (cucumber semantics)
 */
async function executeHooks(
    test: AnyTestType,
    hooks: HookDefinition[],
    world: WorldBase,
    testCase: Pickle,
    defaultHookName: string,
    createPayload: (hook: HookDefinition) => unknown,
    defaultTimeout?: number
): Promise<ExecutionStatus | undefined> {
    let status: ExecutionStatus | undefined;
    for (const hook of hooks) {
        if (!hook.appliesToTestCase(testCase)) {
            continue;
        }

        const hookName = hook.name ?? defaultHookName;
        const location = getLine(hook);
        const returned = await test.step(
            hookName,
            () => invokeHook(hook, world, [createPayload(hook)], hookName, defaultTimeout),
            location
        );
        if (returned === 'skipped') status = 'skipped';
    }
    return status;
}

function createStepHookParameter(
    feature: Feature,
    testCase: Pickle,
    pickleStep: PickleStep,
    result: TestExecutionResult
) {
    return {
        gherkinDocument: feature.gherkinDocument,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
        testStepId: DEFAULT_VALUES.TEST_STEP_ID,
        pickle: testCase,
        pickleStep,
        result: createHookResult(result)
    };
}

function createCaseHookParameter(
    feature: Feature,
    testCase: Pickle,
    result: TestExecutionResult
) {
    return {
        gherkinDocument: feature.gherkinDocument,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
        pickle: testCase,
        result: createHookResult(result)
    };
}

function findSingleStepDefinition(
    supportCodeLibrary: SupportCodeLibrary,
    pickleStep: PickleStep,
    stepLocation: string
): StepDefinitionMatch {
    const matchingSteps = supportCodeLibrary.stepDefinitions
        .filter(stepDefinition => stepDefinition.matchesStepName(pickleStep.text));

    if (matchingSteps.length === 0) {
        const snippet = buildSnippet(supportCodeLibrary, pickleStep);
        throw new StepStatusError([
            `Step '${pickleStep.text}' is not defined`,
            `  at ${stepLocation}`,
            ...(snippet ? ['', 'Implement it with the following snippet:', '', snippet] : [])
        ].join('\n'), 'undefined');
    }

    if (matchingSteps.length > 1) {
        const locations = matchingSteps
            .map(s => `  ${String(s.pattern ?? '')} - ${s.uri}:${s.line}`)
            .join('\n');
        throw new StepStatusError(
            `Step '${pickleStep.text}' matches multiple step definitions:\n${locations}\n  at ${stepLocation}`,
            'ambiguous'
        );
    }

    return matchingSteps[0];
}

function executeBeforeAllHooks(test: AnyTestType, hooks: HookDefinition[], defaultTimeout?: number): void {
    if (hooks.length === 0) return;
    test.beforeAll(async () => {
        for (const hook of hooks) {
            const location = getLine(hook);
            await test.step(
                HOOK_NAMES.BEFORE_ALL,
                () => invokeHook(hook, {}, [], HOOK_NAMES.BEFORE_ALL, defaultTimeout),
                location
            );
        }
    });
}

function executeAfterAllHooks(test: AnyTestType, hooks: HookDefinition[], defaultTimeout?: number): void {
    if (hooks.length === 0) return;
    test.afterAll(async () => {
        for (const hook of hooks) {
            const location = getLine(hook);
            await test.step(
                HOOK_NAMES.AFTER_ALL,
                () => invokeHook(hook, {}, [], HOOK_NAMES.AFTER_ALL, defaultTimeout),
                location
            );
        }
    });
}

/**
 * Create scenario filter from tag expressions keyed by their source (used in error messages),
 * e.g. `{ 'tags option': config.tags, 'CUCUMBER_TAGS env variable': process.env.CUCUMBER_TAGS }`.
 * All expressions must match.
 */
export function createTagFilter(sources: Record<string, string | undefined>): (pickle: Pickle) => boolean {
    const nodes = Object.entries(sources)
        .map(([source, expression]) => [source, expression?.trim()] as const)
        .filter((entry): entry is readonly [string, string] => !!entry[1])
        .map(([source, expression]) => parseTagExpression(expression, source));
    return pickle => {
        const tagNames = pickle.tags.map(tag => tag.name);
        return nodes.every(node => node.evaluate(tagNames));
    };
}

/**
 * `@retries(n)` is applied with `test.describe.configure`, which works per feature only
 */
function assertRetriesOnFeatureOnly(feature: Feature, featureTags: readonly { name: string }[]): void {
    const featureTagNames = new Set(featureTags.map(tag => tag.name));
    for (const testCase of feature.tests) {
        const misplaced = testCase.tags.find(tag => tag.name.startsWith('@retries(') && !featureTagNames.has(tag.name));
        if (misplaced) {
            throw new Error(`${misplaced.name} is supported only on Feature, found on '${testCase.name}' in ${feature.uri}`);
        }
    }
}

/**
 * Make feature titles unique, so scenarios from features with the same name do not clash
 */
function uniqueFeatureTitles(features: Feature[]): string[] {
    const titles = features.map(feature => featureTitle(feature.feature, relative(process.cwd(), feature.uri)));
    return titles.map((title, index) => titles.indexOf(title) === index
        ? title
        : `${title} (${relative(process.cwd(), features[index].uri)})`
    );
}

export function defineConfig(config: CucumberAdapterConfig): void {
    const {features, supportCodeLibrary} = load(config);
    const strict = config.strict ?? true;
    const worldParameters = config.worldParameters ?? {};
    const tagFilter = createTagFilter({
        '`tags` config option': config.tags,
        'CUCUMBER_TAGS env variable': process.env.CUCUMBER_TAGS
    });
    const stepLocationMode = config.stepLocation ?? 'definition';

    const fixture = new supportCodeLibrary.World({config, parameters: worldParameters}) as WorldBase;
    const test = fixture.test as AnyTestType;
    const defaultTimeout = supportCodeLibrary.defaultTimeout;
    executeBeforeAllHooks(test, supportCodeLibrary.beforeTestRunHookDefinitions, defaultTimeout);

    const titles = uniqueFeatureTitles(features);
    features.forEach((feature, featureIndex) => {
        const tests = feature.tests.filter(tagFilter);
        if (tests.length === 0) return;
        const positions = collectPositions(feature.gherkinDocument);
        const featureTags = feature.gherkinDocument.feature?.tags ?? [];
        const retries = resolveRetries(featureTags);
        assertRetriesOnFeatureOnly(feature, featureTags);
        const featureLocation = feature.gherkinDocument.feature
            ? {file: feature.uri, ...feature.gherkinDocument.feature.location, column: feature.gherkinDocument.feature.location.column ?? 1}
            : undefined;

        callAt(featureLocation, test.describe, [titles[featureIndex], () => {
            if (retries !== undefined) test.describe.configure({retries});

            for (const testCase of tests) {
                const {tag, annotation, lock, timeout} = resolveTestDetails(testCase);
                const testBody = async (fixtures: Record<string, unknown>) => {
                    const world = new supportCodeLibrary.World({
                        log,
                        attach,
                        supportCodeLibrary,
                        config,
                        parameters: worldParameters
                    });
                    world.init(fixtures);
                    const testInfo = world.test.info();
                    if (timeout !== undefined) testInfo.setTimeout(timeout);

                    const result = createTestExecutionResult();
                    const markStatus = (status: ExecutionStatus, error?: Error) => {
                        if (result.status !== 'passed') return;
                        result.status = status;
                        result.error = error;
                    };
                    // soft assertions do not throw, but fail the test
                    const markSoftErrors = () => {
                        const softError = testInfo.errors[0];
                        if (softError) markStatus('failed', new Error(softError.message ?? softError.value));
                    };
                    const markError = (err: unknown) => {
                        if (testInfo.expectedStatus === 'skipped') return markStatus('skipped', err as Error);
                        markStatus(err instanceof StepStatusError ? err.status : 'failed', err as Error);
                    };

                    try {
                        const beforeStatus = await executeHooks(
                            test,
                            supportCodeLibrary.beforeTestCaseHookDefinitions,
                            world,
                            testCase,
                            HOOK_NAMES.BEFORE,
                            () => createCaseHookPayload(feature, testCase),
                            defaultTimeout
                        );
                        if (beforeStatus) markStatus(beforeStatus);

                        for (const pickleStep of testCase.steps) {
                            if (result.status === 'skipped' || result.status === 'pending') {
                                break;
                            }
                            const stepLocation = resolveLocation(positions, feature.uri, pickleStep.astNodeIds);
                            let step: StepDefinitionMatch | undefined;
                            let lookupError: unknown;
                            try {
                                step = findSingleStepDefinition(supportCodeLibrary, pickleStep, formatLocation(stepLocation));
                            } catch (err) {
                                // undefined or ambiguous: reported as a failed step pointing to the feature file
                                lookupError = err;
                            }
                            const location = step && stepLocationMode === 'definition' ? getLine(step) : {location: stepLocation};
                            await test.step(stepTitle(pickleStep), async () => {
                                if (!step) throw lookupError;
                                await executeHooks(
                                    test,
                                    supportCodeLibrary.beforeTestStepHookDefinitions,
                                    world,
                                    testCase,
                                    HOOK_NAMES.BEFORE_STEP,
                                    () => ({
                                        gherkinDocument: feature.gherkinDocument,
                                        pickle: testCase,
                                        pickleStep
                                    }),
                                    defaultTimeout
                                );
                                try {
                                    const {parameters} = await step.getInvocationParameters({
                                        step: {
                                            text: pickleStep.text,
                                            argument: pickleStep.argument
                                        },
                                        world
                                    });
                                    const returned = await runWithTimeout(
                                        () => step.code.apply(world, parameters),
                                        resolveTimeout(step, defaultTimeout),
                                        `Step '${pickleStep.text}' timed out after {timeout} ms\n  at ${step.uri}:${step.line}`
                                    );
                                    if (returned === 'skipped') {
                                        markStatus('skipped');
                                    } else if (returned === 'pending') {
                                        const error = new StepStatusError(
                                            `Step '${pickleStep.text}' is pending\n  at ${formatLocation(stepLocation)}`,
                                            'pending'
                                        );
                                        markStatus('pending', error);
                                        if (strict) throw error;
                                    }
                                    markSoftErrors();
                                } catch (err) {
                                    markError(err);
                                    throw err;
                                } finally {
                                    await executeHooks(
                                        test,
                                        supportCodeLibrary.afterTestStepHookDefinitions,
                                        world,
                                        testCase,
                                        HOOK_NAMES.AFTER_STEP,
                                        () => createStepHookParameter(feature, testCase, pickleStep, result),
                                        defaultTimeout
                                    );
                                }
                            }, location);
                        }
                    } catch (err) {
                        markError(err);
                        throw err;
                    } finally {
                        markSoftErrors();
                        await executeHooks(
                            test,
                            supportCodeLibrary.afterTestCaseHookDefinitions,
                            world,
                            testCase,
                            HOOK_NAMES.AFTER,
                            () => createCaseHookParameter(feature, testCase, result),
                            defaultTimeout
                        );
                    }

                    if (result.status === 'skipped') {
                        world.test.skip(true, 'Scenario skipped by step or hook');
                    }
                    if (result.status === 'pending') {
                        world.test.fixme(true, result.error?.message);
                    }
                };
                testBody.toString = () => fixture.init.toString();
                const details = lock.length > 0 ? {tag, annotation, lock} : {tag, annotation};
                const testLocation = resolveLocation(positions, feature.uri, testCase.astNodeIds);
                callAt(testLocation, test, [testCase.name, details, testBody]);
            }

        }]);
    });

    executeAfterAllHooks(test, supportCodeLibrary.afterTestRunHookDefinitions, defaultTimeout);
}

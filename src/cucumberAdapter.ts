import {load} from './loader';
import type {TestInfo, TestType} from '@playwright/test';
import type {ITestCaseHookParameter, ITestStepHookParameter} from '@cucumber/cucumber';
import type {Pickle, PickleStep} from '@cucumber/messages';
import type {
    CucumberAdapterConfig,
    Feature,
    HookDefinition,
    HookResult,
    StepDefinitionMatch,
    SupportCodeLibrary,
    WorldBase
} from './types';

const ANNOTATION_TYPES = {
    NAME: 'name',
    URI: 'uri',
    TAGS: 'tags'
} as const;

const HOOK_NAMES = {
    BEFORE_ALL: 'Before All',
    AFTER_ALL: 'After All',
    BEFORE: 'Before',
    AFTER: 'After',
    BEFORE_STEP: 'Before Step',
    AFTER_STEP: 'After Step',
    WORLD: 'World',
    BEFORE_HOOKS: 'Before Hooks',
    AFTER_HOOKS: 'After Hooks'
} as const;

const DEFAULT_VALUES = {
    ATTACHMENT_FILENAME: 'attachment',
    CONTENT_TYPE: 'text/plain',
    COLUMN: 1,
    TEST_CASE_ID: '0',
    TEST_STEP_ID: '0'
} as const;

const STEP_ARGUMENT_LABELS = {
    DOC_STRING: ' [MultiLine]',
    DATA_TABLE: ' [DataTable]'
} as const;

interface Location {
    file: string;
    line: number;
    column: number;
}

interface TestExecutionResult {
    status: string;
    error?: Error;
    start: number;
}

function getLine(step: Pick<HookDefinition, 'uri' | 'line'>): { location: Location } {
    return {
        location: {
            column: DEFAULT_VALUES.COLUMN,
            file: step.uri,
            line: step.line
        }
    };
}

function log(data: unknown): void {
    console.log(data);
}

function attach(
    this: { test: { info: () => TestInfo } },
    body: unknown,
    details?: { fileName?: string; mediaType?: string }
): Promise<void> {
    const fileName = details?.fileName ?? DEFAULT_VALUES.ATTACHMENT_FILENAME;
    const contentType = details?.mediaType ?? DEFAULT_VALUES.CONTENT_TYPE;
    return this.test.info().attach(fileName, { body: body as string | Buffer, contentType });
}

function stepName(pickleStep: PickleStep): string {
    let step = pickleStep.text;

    if (pickleStep.argument) {
        step += pickleStep.argument.docString
            ? STEP_ARGUMENT_LABELS.DOC_STRING
            : STEP_ARGUMENT_LABELS.DATA_TABLE;
    }

    return step;
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

function createScenarioAnnotation(testCase: Pickle): { type: string; description: string }[] {
    const tag = [...new Set(testCase.tags.map(item => item.name))];
    return [
        {type: ANNOTATION_TYPES.NAME, description: testCase.name},
        {type: ANNOTATION_TYPES.URI, description: testCase.uri},
        {type: ANNOTATION_TYPES.TAGS, description: JSON.stringify(tag)}
    ];
}

function createScenarioTags(testCase: Pickle): string[] {
    return [...new Set<string>(testCase.tags.map(item => item.name))];
}

function createCaseHookPayload(feature: Feature, testCase: Pickle): ITestCaseHookParameter {
    return {
        gherkinDocument: feature.gherkinDocument,
        pickle: testCase
    } as ITestCaseHookParameter;
}

async function executeCaseHooks(
    test: TestType<Record<string, unknown>, Record<string, unknown>>,
    hooks: HookDefinition[],
    world: unknown,
    testCase: Pickle,
    defaultHookName: string,
    createPayload: (hook: HookDefinition) => unknown
): Promise<void> {
    for (const hook of hooks) {
        if (!hook.appliesToTestCase(testCase)) {
            continue;
        }

        const hookName = hook.name ?? defaultHookName;
        const location = getLine(hook);
        await test.step(
            hookName,
            () => hook.code.apply(world, [createPayload(hook)]),
            location
        );
    }
}

async function executeStepHooks(
    test: TestType<Record<string, unknown>, Record<string, unknown>>,
    hooks: HookDefinition[],
    world: unknown,
    testCase: Pickle,
    hookName: string,
    createPayload: (hook: HookDefinition) => unknown
): Promise<void> {
    for (const hook of hooks) {
        if (!hook.appliesToTestCase(testCase)) {
            continue;
        }

        const location = getLine(hook);
        await test.step(
            hookName,
            () => hook.code.apply(world, [createPayload(hook)]),
            location
        );
    }
}

function createStepHookParameter(
    feature: Feature,
    testCase: Pickle,
    pickleStep: PickleStep,
    result: TestExecutionResult
): ITestStepHookParameter {
    return {
        gherkinDocument: feature.gherkinDocument,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
        testStepId: DEFAULT_VALUES.TEST_STEP_ID,
        pickle: testCase,
        pickleStep,
        result: createHookResult(result)
    } as unknown as ITestStepHookParameter;
}

function createCaseHookParameter(
    feature: Feature,
    testCase: Pickle,
    result: TestExecutionResult
): ITestCaseHookParameter {
    return {
        gherkinDocument: feature.gherkinDocument,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
        pickle: testCase,
        result: createHookResult(result)
    } as unknown as ITestCaseHookParameter;
}

function findSingleStepDefinition(
    supportCodeLibrary: SupportCodeLibrary,
    pickleStep: PickleStep,
    featureUri: string
): StepDefinitionMatch {
    const matchingSteps = supportCodeLibrary.stepDefinitions
        .filter(stepDefinition => stepDefinition.matchesStepName(pickleStep.text));

    if (matchingSteps.length === 0) {
        throw new Error(
            `Step '${pickleStep.text}' is not defined\n  at ${featureUri}`
        );
    }

    if (matchingSteps.length > 1) {
        const locations = matchingSteps
            .map(s => `  ${s.uri}:${s.line}`)
            .join('\n');
        throw new Error(
            `Step '${pickleStep.text}' matches multiple step definitions:\n${locations}`
        );
    }

    return matchingSteps[0];
}

function executeBeforeAllHooks(
    test: TestType<Record<string, unknown>, Record<string, unknown>>,
    hooks: HookDefinition[]
): void {
    if (hooks.length === 0) return;
    test.beforeAll(async () => {
        for (const hook of hooks) {
            const location = getLine(hook);
            await test.step(
                HOOK_NAMES.BEFORE_ALL,
                () => hook.code.apply({}),
                location
            );
        }
    });
}

function executeAfterAllHooks(
    test: TestType<Record<string, unknown>, Record<string, unknown>>,
    hooks: HookDefinition[]
): void {
    if (hooks.length === 0) return;
    test.afterAll(async () => {
        for (const hook of hooks) {
            const location = getLine(hook);
            await test.step(
                HOOK_NAMES.AFTER_ALL,
                () => hook.code.apply({}),
                location
            );
        }
    });
}

export function defineConfig(config: CucumberAdapterConfig): void {
    const {features, supportCodeLibrary} = load(config);

    const fixture = new supportCodeLibrary.World({config}) as WorldBase;
    const test = fixture.test as TestType<Record<string, unknown>, Record<string, unknown>>;
    executeBeforeAllHooks(test, supportCodeLibrary.beforeTestRunHookDefinitions);

    for (const feature of features) {
        const tests = feature.tests;
        test.describe(feature.feature as string, () => {

            for (const testCase of tests) {
                const tag = createScenarioTags(testCase);
                const annotation = createScenarioAnnotation(testCase);
                const testBody = async (fixtures: Record<string, unknown>) => {
                    const world = new supportCodeLibrary.World({
                        log,
                        attach,
                        supportCodeLibrary,
                        config
                    });
                    world.init(fixtures);

                    const result = createTestExecutionResult();

                    await executeCaseHooks(
                        test,
                        supportCodeLibrary.beforeTestCaseHookDefinitions,
                        world,
                        testCase,
                        HOOK_NAMES.BEFORE,
                        () => createCaseHookPayload(feature, testCase)
                    );

                    try {
                        for (const pickleStep of testCase.steps) {
                            if (result.status !== 'passed') {
                                break;
                            }
                            const step = findSingleStepDefinition(supportCodeLibrary, pickleStep, feature.uri);
                            const location = getLine(step);
                            await test.step(stepName(pickleStep), async () => {
                                await executeStepHooks(
                                    test,
                                    supportCodeLibrary.beforeTestStepHookDefinitions,
                                    world,
                                    testCase,
                                    HOOK_NAMES.BEFORE_STEP,
                                    () => ({
                                        gherkinDocument: feature.gherkinDocument,
                                        pickle: testCase,
                                        pickleStep
                                    })
                                );
                                const {parameters} = await step.getInvocationParameters({
                                    step: {
                                        text: pickleStep.text,
                                        argument: pickleStep.argument
                                    },
                                    world
                                });
                                try {
                                    await step.code.apply(world, parameters);
                                } catch (err) {
                                    result.status = 'failed';
                                    result.error = err as Error;
                                    throw err;
                                } finally {
                                    await executeStepHooks(
                                        test,
                                        supportCodeLibrary.afterTestStepHookDefinitions,
                                        world,
                                        testCase,
                                        HOOK_NAMES.AFTER_STEP,
                                        () => createStepHookParameter(feature, testCase, pickleStep, result)
                                    );
                                }
                            }, location);
                        }
                    } finally {
                        await executeCaseHooks(
                            test,
                            supportCodeLibrary.afterTestCaseHookDefinitions,
                            world,
                            testCase,
                            HOOK_NAMES.AFTER,
                            () => createCaseHookParameter(feature, testCase, result)
                        );
                    }

                };
                testBody.toString = () => fixture.init.toString();
                test(testCase.name, {tag, annotation}, testBody);
            }

        });
    }

    executeAfterAllHooks(test, supportCodeLibrary.afterTestRunHookDefinitions);
}

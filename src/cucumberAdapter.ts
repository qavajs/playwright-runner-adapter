import {load} from './loader';
import type {TestInfo, TestType} from '@playwright/test';
import type {ITestCaseHookParameter, ITestStepHookParameter} from '@cucumber/cucumber';

// Constants
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

// Type definitions
interface Location {
    file: string;
    line: number;
    column: number;
}

interface StepDefinition {
    uri: string;
    line: number;
}

interface TestResult {
    status: string;
    error?: Error;
}

interface TestExecutionResult extends TestResult {
    start: number;
}

/**
 * Creates a location object from step definition
 */
function getLine(step: StepDefinition): { location: Location } {
    return {
        location: {
            column: DEFAULT_VALUES.COLUMN,
            file: step.uri,
            line: step.line
        }
    };
}

/**
 * Logs data to console
 */
function log(data: unknown): void {
    console.log(data);
}

/**
 * Attaches content to test report
 */
function attach(
    this: { test: { info: () => TestInfo } },
    body: string | Buffer,
    details?: { fileName?: string; mediaType?: string }
): Promise<void> {
    const fileName = details?.fileName ?? DEFAULT_VALUES.ATTACHMENT_FILENAME;
    const contentType = details?.mediaType ?? DEFAULT_VALUES.CONTENT_TYPE;
    return this.test.info().attach(fileName, { body, contentType });
}

/**
 * Generates a human-readable step name with argument type indicator
 */
function stepName(pickleStep: {
    text: string;
    argument?: { docString?: unknown }
}): string {
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

function createHookResult(result: TestExecutionResult): any {
    return {
        duration: (Date.now() - result.start) as any,
        message: result.error?.message,
        status: result.status.toUpperCase(),
        exception: result.error
    };
}

function createStepHookParameter(
    feature: any,
    testCase: any,
    pickleStep: any,
    result: TestExecutionResult
): ITestStepHookParameter {
    return {
        gherkinDocument: feature.gherkinDocument,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
        testStepId: DEFAULT_VALUES.TEST_STEP_ID,
        pickle: testCase,
        pickleStep,
        result: createHookResult(result)
    } as any;
}

function createCaseHookParameter(
    feature: any,
    testCase: any,
    result: TestExecutionResult
): ITestCaseHookParameter {
    return {
        gherkinDocument: feature.gherkinDocument,
        testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
        pickle: testCase,
        result: createHookResult(result)
    } as any;
}

function findSingleStepDefinition(
    supportCodeLibrary: any,
    pickleStep: { text: string }
): any {
    const matchingSteps = supportCodeLibrary.stepDefinitions
        .filter((stepDefinition: any) => stepDefinition.matchesStepName(pickleStep.text));

    if (matchingSteps.length === 0) {
        throw new Error(`Step '${pickleStep.text}' is not defined`);
    }

    if (matchingSteps.length > 1) {
        throw new Error(`Step '${pickleStep.text}' matches multiple step definitions`);
    }

    return matchingSteps[0];
}

/**
 * Executes before all hooks
 */
function executeBeforeAllHooks(
    test: TestType<any, any>,
    hooks: any[]
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
    })
}

/**
 * Executes after all hooks
 */
function executeAfterAllHooks(
    test: TestType<any, any>,
    hooks: any[]
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

/**
 * Main configuration function that sets up Cucumber adapter for Playwright
 */
export function defineConfig(config: any): any {
    const {features, supportCodeLibrary} = load(config);

    const fixture = new supportCodeLibrary.World({config});
    const test: TestType<any, any> = fixture.test;
    executeBeforeAllHooks(test, supportCodeLibrary.beforeTestRunHookDefinitions);

    for (const feature of features) {
        const tests = feature.tests;
        test.describe(feature.feature as string, () => {

            for (const testCase of tests) {
                const tag = [...new Set(testCase.tags.map((tag: { name: string }) => tag.name))];
                const annotation = [
                    {type: ANNOTATION_TYPES.NAME, description: testCase.name},
                    {type: ANNOTATION_TYPES.URI, description: testCase.uri},
                    {type: ANNOTATION_TYPES.TAGS, description: JSON.stringify(tag)}
                ];
                const testBody = async (fixtures: any) => {
                    const world = new supportCodeLibrary.World({
                        log,
                        attach,
                        supportCodeLibrary,
                        config
                    });
                    world.init(fixtures);

                    const result = createTestExecutionResult();

                    for (const beforeHook of supportCodeLibrary.beforeTestCaseHookDefinitions) {
                        if (beforeHook.appliesToTestCase(testCase)) {
                            const hookName = beforeHook.name ?? 'Before';
                            const location = getLine(beforeHook);
                            await test.step(
                                hookName,
                                () => beforeHook.code.apply(world, [{
                                    gherkinDocument: feature.gherkinDocument,
                                    pickle: testCase
                                } as ITestCaseHookParameter]),
                                location
                            );
                        }
                    }

                    try {
                        for (const pickleStep of testCase.steps) {
                            if (result.status !== 'passed') {
                                break;
                            }
                            const step = findSingleStepDefinition(supportCodeLibrary, pickleStep);
                            const location = getLine(step);
                            await test.step(stepName(pickleStep), async () => {
                                for (const beforeStep of supportCodeLibrary.beforeTestStepHookDefinitions) {
                                    if (beforeStep.appliesToTestCase(testCase)) {
                                        const location = getLine(beforeStep);
                                        await test.step(
                                            HOOK_NAMES.BEFORE_STEP,
                                            () => beforeStep.code.apply(world, [{
                                                gherkinDocument: feature.gherkinDocument,
                                                pickle: testCase,
                                                pickleStep
                                            }]),
                                            location
                                        );
                                    }
                                }
                                const {parameters} = await step.getInvocationParameters({
                                    step: {
                                        text: pickleStep.text,
                                        argument: pickleStep.argument
                                    },
                                    world
                                } as any);
                                try {
                                    await step.code.apply(world, parameters);
                                } catch (err: any) {
                                    result.status = 'failed';
                                    result.error = err;
                                    throw err;
                                } finally {
                                    for (const afterStep of supportCodeLibrary.afterTestStepHookDefinitions) {
                                        if (afterStep.appliesToTestCase(testCase)) {
                                            const location = getLine(afterStep);
                                            await test.step(
                                                HOOK_NAMES.AFTER_STEP,
                                                () => afterStep.code.apply(world, [{
                                                    ...createStepHookParameter(feature, testCase, pickleStep, result)
                                                }]),
                                                location
                                            );
                                        }
                                    }
                                }
                            }, location);
                        }
                    } finally {
                        for (const afterHook of supportCodeLibrary.afterTestCaseHookDefinitions) {
                            if (afterHook.appliesToTestCase(testCase)) {
                                const hookName = afterHook.name ?? 'After';
                                const location = getLine(afterHook);
                                await test.step(
                                    hookName,
                                    () => afterHook.code.apply(world, [{
                                        ...createCaseHookParameter(feature, testCase, result)
                                    }]),
                                    location
                                );
                            }
                        }
                    }

                }
                testBody.toString = () => fixture.init.toString();
                test(testCase.name, {tag, annotation}, testBody);
            }

        });
    }

    executeAfterAllHooks(test, supportCodeLibrary.afterTestRunHookDefinitions);
}
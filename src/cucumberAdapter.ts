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

interface FeatureContext {
    gherkinDocument: unknown;
}

interface PickleStep {
    text: string;
    argument?: { docString?: unknown };
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

function createScenarioAnnotation(testCase: any): { type: string; description: string }[] {
    const tag = [...new Set(testCase.tags.map((item: { name: string }) => item.name))];
    return [
        {type: ANNOTATION_TYPES.NAME, description: testCase.name},
        {type: ANNOTATION_TYPES.URI, description: testCase.uri},
        {type: ANNOTATION_TYPES.TAGS, description: JSON.stringify(tag)}
    ];
}

function createScenarioTags(testCase: any): string[] {
    return [...new Set<string>(testCase.tags.map((item: { name: string }) => item.name))];
}

function createCaseHookPayload(feature: FeatureContext, testCase: any): ITestCaseHookParameter {
    return {
        gherkinDocument: feature.gherkinDocument,
        pickle: testCase
    } as ITestCaseHookParameter;
}

async function executeCaseHooks(
    test: TestType<any, any>,
    hooks: any[],
    world: any,
    testCase: any,
    defaultHookName: string,
    createPayload: (hook: any) => any
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
    test: TestType<any, any>,
    hooks: any[],
    world: any,
    testCase: any,
    hookName: string,
    createPayload: (hook: any) => any
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
    pickleStep: PickleStep
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
                const tag = createScenarioTags(testCase);
                const annotation = createScenarioAnnotation(testCase);
                const testBody = async (fixtures: any) => {
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
                            const step = findSingleStepDefinition(supportCodeLibrary, pickleStep);
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
                                } as any);
                                try {
                                    await step.code.apply(world, parameters);
                                } catch (err: any) {
                                    result.status = 'failed';
                                    result.error = err;
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

                }
                testBody.toString = () => fixture.init.toString();
                test(testCase.name, {tag, annotation}, testBody);
            }

        });
    }

    executeAfterAllHooks(test, supportCodeLibrary.afterTestRunHookDefinitions);
}
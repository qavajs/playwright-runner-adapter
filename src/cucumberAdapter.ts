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

interface HookResult {
    duration: number | { nanos: number; seconds: number };
    message?: string;
    status: string;
    exception?: Error;
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

    const worlds = new Map<string, any>();

    for (const feature of features) {
        const tests = feature.tests;
        test.describe(feature.feature as string, () => {

            for (const testCase of tests) {
                const tag = [...new Set(testCase.tags.map((tag: { name: string }) => tag.name))];
                const annotation = [
                    {type: 'name', description: testCase.name},
                    {type: 'uri', description: testCase.uri},
                    {type: 'tags', description: JSON.stringify(tag)}
                ];
                const testBody = async (fixtures: any) => {

                    const world = new supportCodeLibrary.World({
                        log,
                        attach,
                        supportCodeLibrary
                    });
                    world.init(fixtures);

                    const result: { status: string, error?: Error, start: number } = {
                        status: 'passed',
                        start: Date.now(),
                    };

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
                            const steps = supportCodeLibrary.stepDefinitions
                                .filter(stepDefinition => stepDefinition.matchesStepName(pickleStep.text));
                            if (steps.length === 0) throw new Error(`Step '${pickleStep.text}' is not defined`);
                            if (steps.length > 1) throw new Error(`Step '${pickleStep.text}' matches multiple step definitions`);
                            const [step] = steps;
                            const location = getLine(step);
                            await test.step(stepName(pickleStep), async () => {
                                for (const beforeStep of supportCodeLibrary.beforeTestStepHookDefinitions) {
                                    if (beforeStep.appliesToTestCase(testCase)) {
                                        const location = getLine(beforeStep);
                                        await test.step(
                                            'Before Step',
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
                                                'After Step',
                                                () => afterStep.code.apply(world, [{
                                                    gherkinDocument: feature.gherkinDocument,
                                                    testCaseStartedId: '0',
                                                    testStepId: '0',
                                                    pickle: testCase,
                                                    pickleStep,
                                                    result: {
                                                        duration: (Date.now() - result.start) as any,
                                                        message: result.error?.message,
                                                        status: result.status.toUpperCase(),
                                                        exception: result.error
                                                    }
                                                } as ITestStepHookParameter]),
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
                                        gherkinDocument: feature.gherkinDocument,
                                        testCaseStartedId: '0',
                                        pickle: testCase,
                                        result: {
                                            duration: (Date.now() - result.start) as any,
                                            message: result.error?.message,
                                            status: result.status.toUpperCase(),
                                            exception: result.error
                                        }
                                    } as ITestCaseHookParameter]),
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
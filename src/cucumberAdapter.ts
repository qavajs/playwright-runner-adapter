import {load} from './loader';
import type {TestInfo, TestType} from '@playwright/test';
import type {ITestCaseHookParameter} from '@cucumber/cucumber';

// Constants
const ANNOTATION_TYPES = {
    TEST_ID: 'testId',
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
    exception?: Error | any;
}

/**
 * Extracts the test ID from TestInfo annotations
 */
function getTestId(testInfo: TestInfo): string {
    const annotation = testInfo.annotations
        .find((annotation) => annotation.type === ANNOTATION_TYPES.TEST_ID);
    
    if (!annotation?.description) {
        throw new Error('Test ID annotation not found');
    }
    
    return annotation.description;
}

/**
 * Converts TestInfo to HookResult format
 */
function getResult(testInfo: TestInfo): HookResult {
    const message = testInfo.errors.length > 0
        ? testInfo.errors.map((err) => err.message).join('\n')
        : undefined;
    
    return {
        duration: testInfo.duration,
        message,
        status: testInfo.status?.toUpperCase() ?? 'UNKNOWN',
        exception: testInfo.error as any
    };
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
): void {
    const fileName = details?.fileName ?? DEFAULT_VALUES.ATTACHMENT_FILENAME;
    const contentType = details?.mediaType ?? DEFAULT_VALUES.CONTENT_TYPE;
    this.test.info().attach(fileName, { body, contentType });
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
 * Overrides Error.captureStackTrace to set custom location for test registration
 */
function setLocation(location: Location): void {
    Error.captureStackTrace = function (target: Error): void {
        (target as any).stack = location;
    };
}

/**
 * Executes before all hooks
 */
async function executeBeforeAllHooks(
    test: TestType<any, any>,
    hooks: any[]
): Promise<void> {
    for (const hook of hooks) {
        const location = getLine(hook);
        await test.step(
            HOOK_NAMES.BEFORE_ALL,
            () => hook.code.apply({}),
            location
        );
    }
}

/**
 * Executes after all hooks
 */
async function executeAfterAllHooks(
    test: TestType<any, any>,
    hooks: any[]
): Promise<void> {
    for (const hook of hooks) {
        const location = getLine(hook);
        await test.step(
            HOOK_NAMES.AFTER_ALL,
            () => hook.code.apply({}),
            location
        );
    }
}

/**
 * Creates test annotations from test case data
 */
function createTestAnnotations(testCase: any): any[] {
    const tags = [...new Set(testCase.tags.map((tag: { name: string }) => tag.name))];
    
    return [
        { type: ANNOTATION_TYPES.NAME, description: testCase.name },
        { type: ANNOTATION_TYPES.URI, description: testCase.uri },
        { type: ANNOTATION_TYPES.TEST_ID, description: testCase.id },
        { type: ANNOTATION_TYPES.TAGS, description: JSON.stringify(tags) }
    ];
}

/**
 * Main configuration function that sets up Cucumber adapter for Playwright
 */
export function defineConfig(config: any): any {
    const {features, supportCodeLibrary} = load(config);

    const fixture = new supportCodeLibrary.World({config});
    const test: TestType<any, any> = fixture.test;

    test.beforeAll(async () => {
        await executeBeforeAllHooks(test, supportCodeLibrary.beforeTestRunHookDefinitions);
    });

    const worlds = new Map<string, any>();

    // Store original captureStackTrace to restore later
    const origCaptureStackTrace = Error.captureStackTrace;

    for (const feature of features) {
        setLocation({
            file: feature.uri,
            line: 1,
            column: 0,
        });

        const tests = feature.tests;

        test.describe(feature.feature as string, async () => {
            /**
             * Factory function to create and register world instances
             */
            const worldFactory = (fixtures: any): void => {
                const world = new supportCodeLibrary.World({
                    log,
                    attach,
                    supportCodeLibrary,
                    config
                });
                world.init(fixtures);
                worlds.set(getTestId(test.info()), world);
            };

            worldFactory.toString = (): string => fixture.init.toString();

            test.beforeEach(HOOK_NAMES.WORLD, worldFactory);

            test.beforeEach(HOOK_NAMES.BEFORE_HOOKS, async () => {
                const testId = getTestId(test.info());
                const world = worlds.get(testId);
                const testCase = tests.find((t: any) => t.id === testId);
                
                if (!testCase) {
                    throw new Error(`Test case with ID ${testId} not found`);
                }
                
                for (const beforeHook of supportCodeLibrary.beforeTestCaseHookDefinitions) {
                    if (beforeHook.appliesToTestCase(testCase)) {
                        const hookName = beforeHook.name ?? HOOK_NAMES.BEFORE;
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
            });

            for (const testCase of tests) {
                const tag = [...new Set(testCase.tags.map((tag: { name: string }) => tag.name))];
                const annotation = createTestAnnotations(testCase);

                setLocation({
                    file: testCase.uri,
                    line: testCase.location?.line ?? 0,
                    column: testCase.location?.column ?? 0,
                });

                test(testCase.name, {tag, annotation}, async () => {
                    const world = worlds.get(testCase.id);
                    const result: TestResult = { status: 'passed' };
                    
                    for (const pickleStep of testCase.steps) {
                        if (result.status !== 'passed') {
                            break;
                        }
                        
                        const matchingSteps = supportCodeLibrary.stepDefinitions
                            .filter((stepDef: any) => stepDef.matchesStepName(pickleStep.text));
                        
                        if (matchingSteps.length === 0) {
                            throw new Error(
                                `Step definition not found for: "${pickleStep.text}"`
                            );
                        }
                        
                        if (matchingSteps.length > 1) {
                            throw new Error(
                                `Ambiguous step "${pickleStep.text}" matches ${matchingSteps.length} definitions`
                            );
                        }
                        
                        const [step] = matchingSteps;
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
                            } catch (err) {
                                result.status = 'failed';
                                result.error = err as Error;
                                throw err;
                            } finally {
                                for (const afterStep of supportCodeLibrary.afterTestStepHookDefinitions) {
                                    if (afterStep.appliesToTestCase(testCase)) {
                                        const location = getLine(afterStep);
                                        await test.step(
                                            HOOK_NAMES.AFTER_STEP,
                                            () => afterStep.code.apply(world, [{
                                                gherkinDocument: feature.gherkinDocument,
                                                testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
                                                testStepId: DEFAULT_VALUES.TEST_STEP_ID,
                                                pickle: testCase,
                                                pickleStep,
                                                result: {
                                                    duration: 0 as any,
                                                    message: result.error?.message,
                                                    status: result.status.toUpperCase(),
                                                    exception: result.error
                                                }
                                            } as any]),
                                            location
                                        );
                                    }
                                }
                            }
                        }, location);
                    }
                })
            }

            test.afterEach(HOOK_NAMES.AFTER_HOOKS, async () => {
                const testInfo = test.info();
                const testId = getTestId(testInfo);
                const world = worlds.get(testId);
                const testCase = tests.find((t) => t.id === testId);
                
                if (!testCase) {
                    throw new Error(`Test case with ID ${testId} not found`);
                }
                
                for (const afterHook of supportCodeLibrary.afterTestCaseHookDefinitions) {
                    if (afterHook.appliesToTestCase(testCase)) {
                        const hookName = afterHook.name ?? HOOK_NAMES.AFTER;
                        const location = getLine(afterHook);
                        await test.step(
                            hookName,
                            () => afterHook.code.apply(world, [{
                                gherkinDocument: feature.gherkinDocument,
                                testCaseStartedId: DEFAULT_VALUES.TEST_CASE_ID,
                                pickle: testCase,
                                result: getResult(testInfo)
                            } as any]),
                            location
                        );
                    }
                }
            });

            test.afterEach(HOOK_NAMES.WORLD, async () => {
                const testId = getTestId(test.info());
                worlds.delete(testId);
            });

        });
    }

    // Restore original captureStackTrace
    Error.captureStackTrace = origCaptureStackTrace;

    test.afterAll(async () => {
        await executeAfterAllHooks(test, supportCodeLibrary.afterTestRunHookDefinitions);
    });
}
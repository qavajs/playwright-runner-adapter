import {load} from './loader';
import type {TestType} from '@playwright/test';
import type {ITestCaseHookParameter, ITestStepHookParameter} from '@cucumber/cucumber';

const {features, supportCodeLibrary} = load();

function getLine(step: { uri: string, line: number }) {
    return {location: {column: 1, file: step.uri, line: step.line}}
}

function log(data: any) {
    console.log(data);
}

function attach(this: { test: any }, body: any, details: any) {
    const fileName = details?.fileName ?? 'attachment';
    const contentType = details?.mediaType ?? 'text/plain';
    this.test.info().attach(fileName, {body, contentType});
}

function stepName(pickleStep: any) {
    let step = pickleStep.text;
    if (pickleStep.argument) {
        step += pickleStep.argument.docString ? ' [MultiLine]' : ' [DataTable]';
    }
    return step;
}

const fixture = new supportCodeLibrary.World({});
const test: TestType<any, any> = fixture.test;

test.beforeAll(async () => {
    for (const beforeAllHook of supportCodeLibrary.beforeTestRunHookDefinitions) {
        const location = getLine(beforeAllHook);
        await test.step(
            'Before All',
            () => beforeAllHook.code.apply({}),
            location
        )
    }
});

for (const feature of features) {
    const tests = feature.tests;
    test.describe(feature.feature as string, () => {

        for (const testCase of tests) {
            const tag = [...new Set(testCase.tags.map((tag: { name: string }) => tag.name))];
            const annotation = [
                {type: 'name', description: testCase.name},
                {type: 'uri', description: testCase.uri},
                {type: 'testId', description: testCase.id},
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

test.afterAll(async () => {
    for (const afterAllHook of supportCodeLibrary.afterTestRunHookDefinitions) {
        const location = getLine(afterAllHook);
        await test.step(
            'After All',
            () => afterAllHook.code.apply({}),
            location
        )
    }
});
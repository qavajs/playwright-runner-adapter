import { load } from './loader';

const { features, supportCodeLibrary} = load();

function log(data: any) {
    console.log(data);
}

function attach(this: { test: any }, body: any, details: any) {
    const fileName = details.fileName ?? 'attachment';
    const contentType = details.mediaType ?? 'text/plain';
    this.test.info().attach(fileName, {body, contentType});
}

const fixture = new supportCodeLibrary.World({});
const test = fixture.test;

for (const beforeAllHook of supportCodeLibrary.beforeTestRunHookDefinitions) {
    test.beforeAll(() => beforeAllHook.code.apply({}));
}

for (const feature of features) {
    const tests = feature.tests;
    test.describe(feature.feature as string, async () => {
        const world = new supportCodeLibrary.World({
            log,
            attach,
            supportCodeLibrary
        });

        test.beforeEach('Init World', world.init);

        test.beforeEach('Before Hooks', async () => {
            const testId = test
                .info()
                .annotations
                .find((annotation: { type: string }) => annotation.type === 'testId')
                .description;
            const testCase = tests.find(test => test.id === testId);
            for (const beforeHook of supportCodeLibrary.beforeTestCaseHookDefinitions) {
                if (beforeHook.appliesToTestCase(testCase)) {
                    const hookName = beforeHook.name ?? 'Before';
                    await test.step(hookName, () => beforeHook.code.apply(world, [{
                        pickle: testCase
                    }]));
                }
            }
        });

        for (const testCase of tests) {
            const tag = testCase.tags.map((tag: { name: string }) => tag.name);
            const annotation = [
                { type: 'name', description: testCase.name },
                { type: 'testId', description: testCase.id },
                { type: 'tags', description: JSON.stringify(testCase.tags) }
            ];
            test(testCase.name, { tag, annotation: annotation }, async () => {
                const testInfo = test.info();
                testInfo.result = { status: 'passed' };
                for (const pickleStep of testCase.steps) {
                    if (testInfo.error) {
                        break;
                    }
                    await test.step(pickleStep.text, async () => {
                        for (const beforeStep of supportCodeLibrary.beforeTestStepHookDefinitions) {
                            if (beforeStep.appliesToTestCase(testCase)) {
                                await test.step('Before Step', () => beforeStep.code.apply(world, [{
                                    pickle: testCase,
                                    pickleStep
                                }]));
                            }
                        }
                        const steps = supportCodeLibrary.stepDefinitions
                            .filter(stepDefinition => stepDefinition.matchesStepName(pickleStep.text));
                        if (steps.length === 0) throw new Error(`Step '${pickleStep.text}' is not defined`);
                        if (steps.length > 1) throw new Error(`'${pickleStep.text}' matches multiple step definitions`);
                        const [step] = steps;
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
                            testInfo.result.error = err;
                            throw err;
                        } finally {
                            for (const afterStep of supportCodeLibrary.afterTestStepHookDefinitions) {
                                if (afterStep.appliesToTestCase(testCase)) {
                                    await test.step('After Step', () => afterStep.code.apply(world, [{
                                        pickle: testCase,
                                        pickleStep,
                                        result: testInfo.result
                                    }]));
                                }
                            }
                        }
                    });
                }
            })
        }

        test.afterEach('After Hooks', async () => {
            const testInfo = test.info();
            const testId = testInfo
                .annotations
                .find((annotation: { type: string }) => annotation.type === 'testId')
                .description;
            const testCase = tests.find(test => test.id === testId);
            for (const afterHook of supportCodeLibrary.afterTestCaseHookDefinitions) {
                if (afterHook.appliesToTestCase(testCase)) {
                    const hookName = afterHook.name ?? 'After';
                    await test.step(hookName, () => afterHook.code.apply(world, [{
                        pickle: testCase,
                        result: testInfo.result
                    }]));
                }
            }
        });

    });
}

for (const afterAllHook of supportCodeLibrary.afterTestRunHookDefinitions) {
    test.afterAll(() => afterAllHook.code.apply({}));
}
import { load } from './loader';

const { features, supportCodeLibrary } = load();

function log(data: any) {
    console.log(data);
}

function attach(this: { test: any }, body: any, details: any) {
    const fileName = details.fileName ?? 'attachment';
    const contentType = details.mediaType ?? 'text/plain';
    this.test.info().attach(fileName, { body, contentType });
}

const fixture = new supportCodeLibrary.World({});
const test = fixture.test;

for (const feature of features) {
    const tests = feature.tests;
    test.describe(feature.feature as string, async () => {
        for (const beforeAllHook of supportCodeLibrary.beforeTestRunHookDefinitions) {
            test.beforeAll(async () => {
                await beforeAllHook.code.apply({});
            });
        }

        const world = new supportCodeLibrary.World({
            log,
            attach
        });

        test.beforeEach(world.init);

        for (const testCase of tests) {
            const tag = testCase.tags.map((tag: { name: string }) => tag.name);
            test(testCase.name, { tag }, async () => {
                for (const beforeHook of supportCodeLibrary.beforeTestCaseHookDefinitions) {
                    if (beforeHook.appliesToTestCase(testCase)) {
                        await test.step('Before', async () => {
                            await beforeHook.code.apply(world, [testCase]);
                        });
                    }
                }
                for (const pickleStep of testCase.steps) {
                    await test.step(pickleStep.text, async () => {
                        for (const beforeStep of supportCodeLibrary.beforeTestStepHookDefinitions) {
                            if (beforeStep.appliesToTestCase(testCase)) {
                                await beforeStep.code.apply(world);
                            }
                        }
                        const steps = supportCodeLibrary.stepDefinitions
                            .filter(stepDefinition => stepDefinition.matchesStepName(pickleStep.text));
                        if (steps.length === 0) throw new Error(`Step '${pickleStep.text}' is not defined`);
                        if (steps.length > 1) throw new Error(`'${pickleStep.text}' matches multiple step definitions`);
                        const [step] = steps;
                        const { parameters} = await step.getInvocationParameters({
                            // @ts-ignore
                            step: {
                                text: pickleStep.text,
                                argument: pickleStep.argument
                            },
                            world
                        });
                        const result: { status: string, error?: any } = { status: 'passed' };
                        try {
                            await step.code.apply(world, parameters);
                        } catch (err) {
                            result.status = 'failed';
                            result.error = err;
                        }
                        for (const afterStep of supportCodeLibrary.afterTestStepHookDefinitions) {
                            if (afterStep.appliesToTestCase(testCase)) {
                                await afterStep.code.apply(world, [{result}]);
                            }
                        }
                        if (result.error) throw result.error;
                    });
                }
                for (const afterHook of supportCodeLibrary.afterTestCaseHookDefinitions) {
                    if (afterHook.appliesToTestCase(testCase)) {
                        await test.step('After', async () => {
                            await afterHook.code.apply(world, [testCase]);
                        });
                    }
                }
            })
        }
        for (const afterAllHook of supportCodeLibrary.afterTestRunHookDefinitions) {
            test.afterAll(async function () {
                await afterAllHook.code.apply({});
            });
        }
    });
}

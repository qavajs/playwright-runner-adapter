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

const stepHandler = test.expect.extend({
    async execute(fn: () => Promise<any>) {
        try {
            await fn();
            return {
                pass: true,
                message: () => ''
            }
        } catch (e: any) {
            return {
                pass: false,
                message: () => e.message,
            }
        }
    }
});

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

        test.beforeEach(world.init);

        for (const testCase of tests) {
            const tag = testCase.tags.map((tag: { name: string }) => tag.name);
            test(testCase.name, {tag}, async () => {
                const testInfo = test.info();
                const result: { status: string, error?: any } = { status: 'passed' };
                for (const beforeHook of supportCodeLibrary.beforeTestCaseHookDefinitions) {
                    if (beforeHook.appliesToTestCase(testCase)) {
                        const hookName = beforeHook.name ?? 'Before';
                        await test.step(hookName, () => beforeHook.code.apply(world, [{
                            pickle: testCase
                        }]));
                    }
                }
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
                        await stepHandler
                            .soft(() => step.code.apply(world, parameters), 'Step')
                            .execute();
                        for (const afterStep of supportCodeLibrary.afterTestStepHookDefinitions) {
                            if (afterStep.appliesToTestCase(testCase)) {
                                await test.step('After Step', () => afterStep.code.apply(world, [{
                                    pickle: testCase,
                                    pickleStep,
                                    result
                                }]));
                            }
                        }
                    });
                }
                for (const afterHook of supportCodeLibrary.afterTestCaseHookDefinitions) {
                    if (afterHook.appliesToTestCase(testCase)) {
                        const hookName = afterHook.name ?? 'After';
                        await test.step(hookName, () => afterHook.code.apply(world, [{
                            pickle: testCase, result
                        }]));
                    }
                }
            })
        }
    });
}

for (const afterAllHook of supportCodeLibrary.afterTestRunHookDefinitions) {
    test.afterAll(() => afterAllHook.code.apply({}));
}
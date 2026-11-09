import { test as base, expect } from '@playwright/test';
import {
    After,
    AfterAll,
    AfterStep,
    Before,
    BeforeStep,
    type ITestCaseHookParameter,
    type ITestStepHookParameter,
    type PlaywrightWorld,
    When
} from '../../adapter';

/**
 * Events each scenario of hookFailures.feature must record (in any order).
 * Hooks and steps record events, the last AfterAll compares them,
 * so a check fails even when the hook that should record an event doesn't run.
 */
const expectedEvents: Record<string, string[]> = {
    '@allAfterHooksRun': ['after hook 1', 'after hook 2'],
    '@stepErrorNotMasked': ['step error reported'],
    '@afterStepGetsStepResult': ['after step "wait 300 ms" took >= 300 ms', 'after step "simple step" took < 300 ms'],
    '@afterStepRunsWhenBeforeStepFails': ['after step FAILED'],
    '@beforeSkipStopsBeforeHooks': [],
    '@allUndefinedStepsListed': ['all undefined steps listed'],
    '@hookOrder': [
        'order: before 1, before 2, before step 1, before step 2, after step 2, after step 1, after 2, after 1'
    ]
};

const checks = new Map<string, { scenario: string; expected: string[]; actual: string[] }>();

function record(testId: string, event: string) {
    checks.get(testId)?.actual.push(event);
}

Before(async function (this: PlaywrightWorld, { pickle }: ITestCaseHookParameter) {
    const tag = pickle.tags.find(tag => tag.name in expectedEvents);
    if (!tag) return;
    checks.set(this.test.info().testId, { scenario: pickle.name, expected: expectedEvents[tag.name], actual: [] });
});

// the final error of a test is only known after the test body, so it is checked in afterEach
base.afterEach(async ({}, testInfo) => {
    const message = testInfo.errors[0]?.message ?? '';
    if (testInfo.tags.includes('@stepErrorNotMasked') && message.includes('step error') && !message.includes('after hook error')) {
        record(testInfo.testId, 'step error reported');
    }
    if (testInfo.tags.includes('@allUndefinedStepsListed')
        && message.includes(`Step 'first undefined step' is not defined`)
        && message.includes(`Step 'second undefined step' is not defined`)) {
        record(testInfo.testId, 'all undefined steps listed');
    }
});

AfterAll(async function () {
    for (const { scenario, expected, actual } of checks.values()) {
        expect.soft([...actual].sort(), `events of '${scenario}'`).toEqual([...expected].sort());
    }
});

When('wait {int} ms', async function (ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
});

When('fail with {string}', async function (message: string) {
    throw new Error(message);
});

When('execute undefined step reports snippet', async function (this: PlaywrightWorld) {
    const error = await this.executeStep('nested undefined step 42').catch((err: Error) => err);
    this.expect((error as Error).message).toContain(`Step 'nested undefined step 42' is not defined`);
    this.expect((error as Error).message).toContain(`'nested undefined step {int}'`);
});

After({ tags: '@allAfterHooksRun' }, async function (this: PlaywrightWorld) {
    record(this.test.info().testId, 'after hook 1');
    throw new Error('after hook 1 error');
});

After({ tags: '@allAfterHooksRun' }, async function (this: PlaywrightWorld) {
    record(this.test.info().testId, 'after hook 2');
    throw new Error('after hook 2 error');
});

After({ tags: '@stepErrorNotMasked' }, async function () {
    throw new Error('after hook error');
});

AfterStep({ tags: '@afterStepGetsStepResult' }, async function (this: PlaywrightWorld, { pickleStep, result }: ITestStepHookParameter) {
    const took = (result?.duration as unknown as number) >= 300 ? '>= 300 ms' : '< 300 ms';
    record(this.test.info().testId, `after step "${pickleStep.text}" took ${took}`);
});

BeforeStep({ tags: '@afterStepRunsWhenBeforeStepFails' }, async function () {
    throw new Error('before step error');
});

AfterStep({ tags: '@afterStepRunsWhenBeforeStepFails' }, async function (this: PlaywrightWorld, { result }: ITestStepHookParameter) {
    record(this.test.info().testId, `after step ${result?.status}`);
});

Before({ tags: '@beforeSkipStopsBeforeHooks' }, async function () {
    // other After hooks of the suite expect a non-zero duration
    await new Promise(resolve => setTimeout(resolve, 5));
    return 'skipped';
});

Before({ tags: '@beforeSkipStopsBeforeHooks' }, async function (this: PlaywrightWorld) {
    record(this.test.info().testId, 'second before hook');
});

// Before hooks run in definition order, After hooks in reverse; `After 1` runs last and records the order
const hookOrder = new Map<string, string[]>();
const orderHook = (name: string) => async function (this: PlaywrightWorld) {
    const testId = this.test.info().testId;
    const order = hookOrder.get(testId) ?? [];
    hookOrder.set(testId, [...order, name]);
};

Before({ tags: '@hookOrder' }, orderHook('before 1'));
Before({ tags: '@hookOrder' }, orderHook('before 2'));
BeforeStep({ tags: '@hookOrder' }, orderHook('before step 1'));
BeforeStep({ tags: '@hookOrder' }, orderHook('before step 2'));
AfterStep({ tags: '@hookOrder' }, orderHook('after step 1'));
AfterStep({ tags: '@hookOrder' }, orderHook('after step 2'));
After({ tags: '@hookOrder' }, async function (this: PlaywrightWorld) {
    const testId = this.test.info().testId;
    record(testId, `order: ${[...(hookOrder.get(testId) ?? []), 'after 1'].join(', ')}`);
});
After({ tags: '@hookOrder' }, orderHook('after 2'));

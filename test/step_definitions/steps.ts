import {
    Given,
    When,
    Then,
    setWorldConstructor,
    DataTable,
    Before,
    After,
    BeforeStep,
    AfterStep,
    BeforeAll,
    AfterAll,
    ITestCaseHookParameter,
    ITestStepHookParameter,
    PlaywrightWorld, Template
} from '../../adapter';
import { test as base, expect as baseExpect, Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Fixture = {
    customFixture: number
}

const fixture = base.extend<Fixture>({
    customFixture: async ({}, use) => {
        await use(42);
    }
});

const customExpect = baseExpect.extend({
    toAlwaysPass() {
        return {
            message: () => 'pass',
            pass: true,
            name: 'toAlwaysPass',
            expected: 'foo',
            actual: 'foo',
        }
    }
});

class ExtendedPlaywrightWorld extends PlaywrightWorld {
    customFixture!: number;
    renamedCustomFixture!: number;
    hookTagRan?: boolean;
    afterHookTagRan?: boolean;
    test = fixture;
    expect = customExpect;

    init = ({ page, customFixture }: { page: Page, customFixture: number }) => {
        this.page = page;
        this.customFixture = customFixture;
        this.renamedCustomFixture = customFixture;
    }
}

setWorldConstructor(ExtendedPlaywrightWorld);

// scenarios that are expected to fail or end with non-passed status
const expectsPass = (pickle: ITestCaseHookParameter['pickle']) =>
    !pickle.tags.some(tag => /^@(statusCheck|fail)\(/.test(tag.name));

// pages are served from test/pages, so tests don't depend on the network
Given('open {string} url', async function (this: ExtendedPlaywrightWorld, page: string) {
    await this.page.goto(pathToFileURL(resolve(__dirname, '../pages', page)).href);
    await this.expect(this.page.locator('h1')).toBeVisible();
});

When(/^simple step$/, async function () {
   console.log('pass');
});

When('data table step', async function (dataTable: DataTable) {
    this.expect(dataTable.raw()).toEqual([['1'], ['2']]);
});

When('multiline step', async function (multiline: string) {
    this.expect(multiline).toEqual('first\nsecond');
});

When('log', async function () {
    this.log('some data');
});

When('attach', async function (this: ExtendedPlaywrightWorld) {
   await this.attach(JSON.stringify({ json: 'data' }), { mediaType: 'application/json', fileName: 'data.json' });
   await this.attach(JSON.stringify({ json: 'data' }));
});

When('custom fixture', async function (this: ExtendedPlaywrightWorld) {
    this.expect(this.customFixture).toEqual(42);
    this.expect(this.renamedCustomFixture).toEqual(42);
});

When('custom expect', async function (this: ExtendedPlaywrightWorld) {
    this.expect(this.page.locator('body')).toAlwaysPass();
});

When('support code library', async function (this: ExtendedPlaywrightWorld) {
    this.expect(this.supportCodeLibrary).toBeTruthy();
});

When('cucumber config', async function (this: ExtendedPlaywrightWorld) {
    this.expect(this.config).toBeTruthy();
});

When('execute step', async function (this: ExtendedPlaywrightWorld) {
    await this.executeStep('simple step');
});

When('fail', async function (this: ExtendedPlaywrightWorld) {
    this.expect(1).toBe(2);
});

Before(async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
});

After(async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.gherkinDocument).toBeTruthy();
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
    if (expectsPass(testCase.pickle)) this.expect(testCase.result?.status).toEqual('PASSED');
    this.expect(testCase.result?.duration).toBeGreaterThan(0);
});

BeforeStep(async function (this: ExtendedPlaywrightWorld, testCase: ITestStepHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.pickleStep).toBeTruthy();
});

AfterStep(async function (this: ExtendedPlaywrightWorld, testCase: ITestStepHookParameter) {
    this.expect(testCase.gherkinDocument).toBeTruthy();
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.pickleStep).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
    if (expectsPass(testCase.pickle)) this.expect(testCase.result?.status).toEqual('PASSED');
});

Before({name: 'Named Before'}, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
});

After({name: 'Named After'}, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.gherkinDocument).toBeTruthy();
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
    if (expectsPass(testCase.pickle)) this.expect(testCase.result?.status).toEqual('PASSED');
    this.expect(testCase.result?.duration).toBeGreaterThan(0);
});

BeforeAll(async function () {
   console.log('Before All');
   customExpect(1).toEqual(1);
});

AfterAll(async function () {
    console.log('After All');
    customExpect(2).toEqual(2);
});

When('soft fail', async function (this: ExtendedPlaywrightWorld) {
    this.expect.soft(1).toBe(2);
});

When('template step', Template(() => `
    simple step
    log
`));

When('log {string}', async function (value) {
    this.log(value);
});

When('I have {int} items', async function (this: ExtendedPlaywrightWorld, count: number) {
    this.expect(count).toBe(42);
});

When('I have {float} value', async function (this: ExtendedPlaywrightWorld, value: number) {
    this.expect(value).toBeCloseTo(3.14);
});

When('I am at step {word}', async function (this: ExtendedPlaywrightWorld, word: string) {
    this.expect(word).toBe('hello');
});

When('tagged before hook ran', async function (this: ExtendedPlaywrightWorld) {
    this.expect(this.hookTagRan).toBe(true);
});

Before({ tags: '@hookTagTest' }, async function (this: ExtendedPlaywrightWorld) {
    this.hookTagRan = true;
});

After({ tags: '@hookTagTest' }, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    if (expectsPass(testCase.pickle)) this.expect(testCase.result?.status).toEqual('PASSED');
    this.afterHookTagRan = true;
});
When('test is marked as slow', async function (this: ExtendedPlaywrightWorld) {
    // default timeout is tripled by test.slow()
    this.expect(this.test.info().timeout).toBe(90_000);
});

When('annotation {string} is {string}', async function (this: ExtendedPlaywrightWorld, type: string, description: string) {
    this.expect(this.test.info().annotations).toContainEqual(this.expect.objectContaining({ type, description }));
});

Then('require module is loaded', async function (this: ExtendedPlaywrightWorld) {
    this.expect((globalThis as Record<string, unknown>).__requireModuleLoaded).toBe(true);
});

Then('world parameter {string} is {string}', async function (this: ExtendedPlaywrightWorld, key: string, value: string) {
    this.expect((this.parameters as Record<string, unknown>)[key]).toBe(value);
});

When('attach with media type string', async function (this: ExtendedPlaywrightWorld) {
    await this.attach(JSON.stringify({ json: 'data' }), 'application/json');
});

When('attach base64 {string} as {string}', async function (this: ExtendedPlaywrightWorld, data: string, mediaType: string) {
    await this.attach(data, mediaType);
});

function lastAttachment(world: ExtendedPlaywrightWorld, name: string) {
    const attachment = world.test.info().attachments.filter(a => a.name === name).at(-1);
    world.expect(attachment, `attachment '${name}' exists`).toBeTruthy();
    return attachment!;
}

Then('attachment {string} has content type {string}', async function (this: ExtendedPlaywrightWorld, name: string, contentType: string) {
    this.expect(lastAttachment(this, name).contentType).toBe(contentType);
});

Then('attachment {string} has body {string}', async function (this: ExtendedPlaywrightWorld, name: string, body: string) {
    // log attachment is written asynchronously
    await this.expect.poll(() => lastAttachment(this, name).body?.toString()).toBe(body);
});

When('pending step', async function () {
    return 'pending';
});

When('skipped step', async function () {
    return 'skipped';
});

Before({ tags: '@failInBefore' }, async function () {
    throw new Error('fail in before hook');
});

const statusChecks: Array<{ scenario: string, expected: string, actual?: string }> = [];

After(async function (this: ExtendedPlaywrightWorld, { pickle, result }: ITestCaseHookParameter) {
    for (const tag of pickle.tags) {
        const match = /^@statusCheck\((\w+)\)$/.exec(tag.name);
        if (match) statusChecks.push({ scenario: pickle.name, expected: match[1], actual: result?.status });
        if (tag.name === '@messageCheck(timed-out)') {
            statusChecks.push({ scenario: pickle.name, expected: 'timed out', actual: /timed out after 100 ms/.test(result?.message ?? '') ? 'timed out' : result?.message });
        }
    }
});

AfterAll(async function () {
    for (const check of statusChecks) {
        customExpect(check.actual, `status of '${check.scenario}'`).toBe(check.expected);
    }
});

When('execute step with arguments', async function (this: ExtendedPlaywrightWorld) {
    await this.executeStep('data table step', [['1'], ['2']]);
    await this.executeStep('data table step', new DataTable([['1'], ['2']]));
    await this.executeStep('multiline step', 'first\nsecond');
});

When('template with arguments', Template(() => `
    data table step
      | 1 |
      | 2 |
    multiline step
      """
      first
      second
      """
`));

Then('test location is line {int} of {string}', async function (this: ExtendedPlaywrightWorld, line: number, file: string) {
    const info = this.test.info();
    this.expect(info.file.endsWith(file)).toBe(true);
    this.expect(info.line).toBe(line);
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

When('step that takes 500 ms with 100 ms timeout', { timeout: 100 }, async function () {
    await sleep(500);
});

Before({ tags: '@slowBeforeHook', timeout: 100 }, async function () {
    await sleep(500);
});

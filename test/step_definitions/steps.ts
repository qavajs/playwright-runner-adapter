import {
    Given,
    When,
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
    test = fixture;
    expect = customExpect;

    init = ({ page, customFixture }: { page: Page, customFixture: number }) => {
        this.page = page;
        this.customFixture = customFixture;
        this.renamedCustomFixture = customFixture;
    }
}

setWorldConstructor(ExtendedPlaywrightWorld);

Given('open {string} url', async function (this: ExtendedPlaywrightWorld, url) {
    await this.page.goto(url);
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

When('attach', async function () {
   this.attach(JSON.stringify({ json: 'data' }), { mediaType: 'application/json', fileName: 'data.json' });
   this.attach(JSON.stringify({ json: 'data' }));
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
    this.expect(testCase.result?.status).toEqual('PASSED');
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
    this.expect(testCase.result?.status).toEqual('PASSED');
});

Before({name: 'Named Before'}, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
});

After({name: 'Named After'}, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.gherkinDocument).toBeTruthy();
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
    this.expect(testCase.result?.status).toEqual('PASSED');
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
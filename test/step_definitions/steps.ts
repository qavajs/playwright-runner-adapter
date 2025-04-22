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
    ITestCaseHookParameter, ITestStepHookParameter
} from '../../index';
import { test as base, expect as baseExpect, Page, Locator } from '@playwright/test';
import { PlaywrightWorld } from '../../src/PlaywrightWorld';

type Fixture = {
    customFixture: number
}

const fixture = base.extend<Fixture>({
    customFixture: async ({}, use) => {
        await use(42);
    }
});

const customExpect = baseExpect.extend({
    toAlwaysPass(locator: Locator) {
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
    constructor(options: any) {
        super(options);
    }

    customFixture!: number;
    test = fixture;
    expect = customExpect;

    init = ({ page, customFixture }: { page: Page, customFixture: number }) => {
        this.page = page;
        this.customFixture = customFixture;
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
   this.attach(JSON.stringify({ json: 'data' }), { mediaType: 'application/json', fileName: 'data.json' })
});

When('custom fixture', async function (this: ExtendedPlaywrightWorld) {
    this.expect(this.customFixture).toEqual(42);
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
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
});

BeforeStep(async function (this: ExtendedPlaywrightWorld, testCase: ITestStepHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.pickleStep).toBeTruthy();
});

AfterStep(async function (this: ExtendedPlaywrightWorld, testCase: ITestStepHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.pickleStep).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
});

Before({name: 'Named Before'}, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
});

After({name: 'Named After'}, async function (this: ExtendedPlaywrightWorld, testCase: ITestCaseHookParameter) {
    this.expect(testCase.pickle).toBeTruthy();
    this.expect(testCase.result).toBeTruthy();
});

BeforeAll(async function () {
   console.log('Before All');
   customExpect(1).toEqual(1);
});

AfterAll(async function () {
    console.log('After All');
    customExpect(2).toEqual(2);
});
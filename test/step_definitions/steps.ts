import { Given, When, setWorldConstructor, DataTable, Before } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { PlaywrightWorld } from '../../src/PlaywrightWorld';

class ExtendedPlaywrightWorld extends PlaywrightWorld {
    constructor(options: any) {
        super(options);
    }

}

setWorldConstructor(ExtendedPlaywrightWorld);

Given('open {string} url', async function (this: ExtendedPlaywrightWorld, url) {
    await this.page.goto(url);
});

When(/^simple step$/, async function () {
   console.log('pass')
});

When('data table step', async function (dataTable: DataTable) {
    expect(dataTable.raw()).toEqual([['1'], ['2']])
});

When('multiline step', async function (multiline: string) {
    expect(multiline).toEqual('first\nsecond')
});

When('log', async function () {
    this.log('some data');
});

When('attach', async function () {
   this.attach(JSON.stringify({json: 'data'}), { mediaType: 'application/json', fileName: 'data.json' })
});

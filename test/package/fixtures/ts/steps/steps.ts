import { Template, withWorld, type DataTable, type PlaywrightWorld } from '@qavajs/playwright-runner-adapter';

const { When, Then } = withWorld<PlaywrightWorld>();

When('I set content {string}', async function (text: string) {
    await this.page.setContent(`<h1>${text}</h1>`);
});

When('I set content from table', async function (table: DataTable) {
    await this.page.setContent(`<h1>${table.hashes()[0].text}</h1>`);
});

Then('page has text {string}', async function (text: string) {
    await this.expect(this.page.locator('h1')).toHaveText(text);
});

When('I greet {string}', Template((name: string) => `
    I set content '${name}'
    page has text '${name}'
`));

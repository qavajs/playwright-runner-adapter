const { When, Then, Template } = require('@qavajs/playwright-runner-adapter/js');

When('I set content {string}', async function (text) {
    await this.page.setContent(`<h1>${text}</h1>`);
});

When('I set content from table', async function (table) {
    await this.page.setContent(`<h1>${table.hashes()[0].text}</h1>`);
});

Then('page has text {string}', async function (text) {
    await this.expect(this.page.locator('h1')).toHaveText(text);
});

When('I greet {string}', Template(name => `
    I set content '${name}'
    page has text '${name}'
`));

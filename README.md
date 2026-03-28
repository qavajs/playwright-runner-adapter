[![npm version](https://badge.fury.io/js/@qavajs%2Fplaywright-runner-adapter.svg)](https://badge.fury.io/js/@qavajs%2Fplaywright-runner-adapter)

# @qavajs/playwright-runner-adapter

Adapter to run [Cucumber](https://cucumber.io/) BDD tests via the [Playwright](https://playwright.dev/) test runner. Write feature files in Gherkin, execute them with Playwright's parallelism, reporting, and fixture system.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [World Classes](#world-classes)
  - [TestWorld](#testworld)
  - [PlaywrightWorld](#playwrightworld)
  - [Custom World](#custom-world)
- [Hooks](#hooks)
- [Step Arguments](#step-arguments)
- [Template Steps](#template-steps)
- [Filtering Tests](#filtering-tests)
  - [Tag Expressions](#tag-expressions)
  - [Predicate Filter](#predicate-filter)
- [Parallelism](#parallelism)
- [JavaScript / CommonJS Support](#javascript--commonjs-support)
- [Limitations](#limitations)

---

## Installation

```bash
npm install @qavajs/playwright-runner-adapter
```

---

## Quick Start

**1. Create a Cucumber config file**

```typescript
// cucumber.config.ts
import { defineConfig } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    paths: ['test/features/**/*.feature'],
    require: ['test/step_definitions/**/*.ts']
});
```

**2. Point Playwright at it**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testMatch: 'cucumber.config.ts'
});
```

**3. Run tests**

```bash
npx playwright test
```

---

## Configuration Reference

`defineConfig` accepts standard Cucumber options:

| Option | Type | Description |
|---|---|---|
| `paths` | `string[]` | Glob patterns for `.feature` files |
| `require` | `string[]` | Glob patterns for step definition files (CommonJS `require`) |
| `import` | `string[]` | Glob patterns for step definition files (ESM `import`) |
| `requireModules` | `string[]` | Modules to require before step definitions (e.g. `ts-node/register`) |

```typescript
// cucumber.config.ts
import { defineConfig } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    paths: ['test/features/**/*.feature'],
    require: ['test/step_definitions/**/*.ts'],
    requireModules: [],
});
```

---

## World Classes

### TestWorld

Base world class with Cucumber lifecycle methods and Playwright's `test` and `expect`.

```typescript
import { TestWorld } from '@qavajs/playwright-runner-adapter';
```

| Property | Type | Description |
|---|---|---|
| `test` | `TestType` | Playwright `test` instance (default or custom) |
| `expect` | `ExpectType` | Playwright `expect` instance (default or custom) |
| `attach` | `function` | Attach files/data to the test report |
| `log` | `function` | Log data to console |
| `parameters` | `string` | Cucumber world parameters |
| `config` | `any` | Cucumber config object |
| `supportCodeLibrary` | `any` | Access to the loaded support code library |

**`executeStep(text, extraParam?)`** — programmatically invoke a step by its text:

```typescript
When('composite step', async function (this: PlaywrightWorld) {
    await this.executeStep('I open the home page');
    await this.executeStep('I click "Login"');
});
```

---

### PlaywrightWorld

Extends `TestWorld` with Playwright browser fixtures pre-wired.

```typescript
import { PlaywrightWorld } from '@qavajs/playwright-runner-adapter';
```

| Property | Type | Description |
|---|---|---|
| `page` | `Page` | Current Playwright page |
| `context` | `BrowserContext` | Current browser context |
| `browser` | `Browser` | Browser instance |
| `request` | `APIRequestContext` | API request context |

Use `PlaywrightWorld` (or a class extending it) as your world constructor when you need browser access in step definitions:

```typescript
import { setWorldConstructor, PlaywrightWorld } from '@qavajs/playwright-runner-adapter';

setWorldConstructor(PlaywrightWorld);

Given('I open {string}', async function (this: PlaywrightWorld, url: string) {
    await this.page.goto(url);
});
```

---

### Custom World

Extend `PlaywrightWorld` to add custom fixtures or override `test`/`expect`.

**Connecting custom Playwright fixtures:**

```typescript
import { test as base, expect as baseExpect, Page } from '@playwright/test';
import { setWorldConstructor, PlaywrightWorld } from '@qavajs/playwright-runner-adapter';

type MyFixtures = {
    settingsPage: SettingsPage;
};

const customTest = base.extend<MyFixtures>({
    settingsPage: async ({ page }, use) => {
        await use(new SettingsPage(page));
    },
});

const customExpect = baseExpect.extend({
    async toBeValid(received) {
        // custom matcher implementation
    },
});

class MyWorld extends PlaywrightWorld {
    settingsPage!: SettingsPage;

    // Override test and expect with extended versions
    test = customTest;
    expect = customExpect;

    // init is called with all fixtures — map them to world properties here
    init = ({ page, settingsPage }: { page: Page; settingsPage: SettingsPage }) => {
        this.page = page;
        this.settingsPage = settingsPage;
    };
}

setWorldConstructor(MyWorld);
```

The `init` function receives Playwright fixtures as its argument. Its signature determines which fixtures Playwright injects — list only the fixtures you need.

---

## Hooks

All standard Cucumber hooks are supported. Hooks run as named Playwright steps and appear in the trace viewer and HTML report.

```typescript
import {
    Before, After,
    BeforeStep, AfterStep,
    BeforeAll, AfterAll,
    ITestCaseHookParameter,
    ITestStepHookParameter,
} from '@qavajs/playwright-runner-adapter';

// Runs before each scenario
Before(async function (this: PlaywrightWorld, { pickle }: ITestCaseHookParameter) {
    console.log('Starting:', pickle.name);
});

// Runs after each scenario — result is available
After(async function (this: PlaywrightWorld, { result }: ITestCaseHookParameter) {
    if (result?.status === 'FAILED') {
        await this.page.screenshot({ path: 'failure.png' });
    }
});

// Runs before/after each step
BeforeStep(async function (this: PlaywrightWorld, { pickleStep }: ITestStepHookParameter) {
    console.log('Step:', pickleStep.text);
});

AfterStep(async function (this: PlaywrightWorld, { result }: ITestStepHookParameter) {
    console.log('Step status:', result?.status);
});

// Runs once per worker process
BeforeAll(async function () {
    // setup shared state
});

AfterAll(async function () {
    // teardown shared state
});
```

**Named hooks** — supply a name to make the hook identifiable in reports:

```typescript
Before({ name: 'Authenticate user' }, async function (this: PlaywrightWorld) {
    // ...
});
```

**Scoped hooks** — use a tag expression to run hooks only for matching scenarios:

```typescript
Before({ tags: '@needsAuth' }, async function (this: PlaywrightWorld) {
    // runs only for scenarios tagged @needsAuth
});
```

---

## Step Arguments

**Data Tables:**

```gherkin
When I submit the form
  | field    | value   |
  | username | alice   |
  | password | secret  |
```

```typescript
import { When, DataTable } from '@qavajs/playwright-runner-adapter';

When('I submit the form', async function (this: PlaywrightWorld, table: DataTable) {
    const rows = table.hashes(); // [{ field: 'username', value: 'alice' }, ...]
});
```

**Doc Strings:**

```gherkin
When I set the body
  """
  {"key": "value"}
  """
```

```typescript
When('I set the body', async function (this: PlaywrightWorld, body: string) {
    // body === '{"key": "value"}'
});
```

---

## Template Steps

`Template` composes a step out of other existing steps, eliminating the need for custom step implementations for common sequences.

```typescript
import { When, Template } from '@qavajs/playwright-runner-adapter';

When('I log in as {string}', Template((username: string) => `
    I fill in "username" with "${username}"
    I fill in "password" with "secret"
    I click "Submit"
`));
```

Each non-empty line in the returned string is executed as an individual step against the current world. Steps run sequentially; a failure stops the sequence.

---

## Filtering Tests

### Tag Expressions

Use `tags` to translate a Cucumber tag expression into a Playwright `grep` pattern:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { tags } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    grep: tags('@smoke and not @slow'),
});
```

Supports the full [Cucumber tag expression syntax](https://github.com/cucumber/tag-expressions): `and`, `or`, `not`, parentheses.

### Predicate Filter

Use `filter` when you need arbitrary logic to select scenarios:

```typescript
import { defineConfig } from '@playwright/test';
import { filter } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    grep: filter(name => name.includes('login')),
});
```

The predicate receives the full test name (feature + scenario title + tags) and should return `true` to include the test.

---

## Parallelism

Playwright projects let you run subsets of scenarios in parallel or serially:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { tags } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    testMatch: 'cucumber.config.ts',
    projects: [
        {
            name: 'parallel',
            grep: tags('not @serial'),
            use: devices['Desktop Chrome'],
            fullyParallel: true,
        },
        {
            name: 'serial',
            grep: tags('@serial'),
            use: devices['Desktop Chrome'],
            fullyParallel: false,
        },
    ],
});
```

Tag scenarios that must run serially with `@serial` (or any tag of your choice) and keep everything else fully parallel.

> To get the current worker index inside a step, use `this.test.info().parallelIndex`.

---

## JavaScript / CommonJS Support

If your step definitions are plain JavaScript (`.js`), import from the `./js` entrypoint to avoid TypeScript overhead:

```javascript
// cucumber.config.js
const { defineConfig } = require('@qavajs/playwright-runner-adapter/js');

module.exports = defineConfig({
    paths: ['test/features/**/*.feature'],
    require: ['test/step_definitions/**/*.js'],
});
```

```javascript
// step_definitions/steps.js
const { Given, When, Then, PlaywrightWorld } = require('@qavajs/playwright-runner-adapter/js');
```

---

## Limitations

- **ES modules** — not supported for Node.js < 22 (where experimental ESM `require` is available). Use CommonJS or TypeScript with `ts-node`.
- **`setParallelCanAssign`** — not supported. Use Playwright [projects](https://playwright.dev/docs/test-projects) with `fullyParallel` to control parallelism.
- **`CUCUMBER_PARALLEL` / `CUCUMBER_TOTAL_WORKERS` / `CUCUMBER_WORKER_ID`** — not supported. Use `this.test.info().parallelIndex` and `this.test.info().workerIndex` instead.

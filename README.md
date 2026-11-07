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
  - [Typed Steps](#typed-steps)
- [Hooks](#hooks)
- [Step Arguments](#step-arguments)
- [Template Steps](#template-steps)
- [Step Results](#step-results)
- [Filtering Tests](#filtering-tests)
  - [Tag Expressions](#tag-expressions)
  - [Predicate Filter](#predicate-filter)
- [Annotations, Modifiers and Locks](#annotations-modifiers-and-locks)
- [Parallelism](#parallelism)
- [Reports](#reports)
- [Entrypoints and JavaScript Support](#entrypoints-and-javascript-support)
- [Timeouts](#timeouts)
- [Supported Cucumber APIs](#supported-cucumber-apis)
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
    testMatch: 'cucumber.config.ts',
    fullyParallel: true
});
```

> All scenarios are defined in a single test file (`cucumber.config.ts`), so without `fullyParallel: true` Playwright runs the whole suite in one worker.

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
| `requireModules` | `string[]` | Module names or paths (resolved from the current working directory) to require before step definitions (e.g. `ts-node/register`) |
| `worldParameters` | `unknown` | Value available in steps and hooks as `this.parameters` |
| `tags` | `string` | Cucumber tag expression selecting scenarios to run |
| `strict` | `boolean` | Fail scenarios with pending steps (default `true`). When `false` they are marked as `fixme` |
| `stepLocation` | `'definition' \| 'feature'` | Location reported for steps: step definition code (default) or the step line in the `.feature` file |

```typescript
// cucumber.config.ts
import { defineConfig } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    paths: ['test/features/**/*.feature'],
    require: ['test/step_definitions/**/*.ts'],
    requireModules: ['./test/support/setup.ts'],
    worldParameters: { baseUrl: 'https://example.com' },
    tags: 'not @wip',
});
```

Environment variables:

| Variable | Description |
|---|---|
| `CUCUMBER_TAGS` | Tag expression combined with the `tags` option using `and`: `CUCUMBER_TAGS='@smoke' npx playwright test` |
| `CUCUMBER_PATHS` | Comma-separated feature globs replacing `paths`: `CUCUMBER_PATHS=features/login.feature npx playwright test` |

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
| `log` | `function` | Log text to the test report (attachment named `log` on the current step) |
| `parameters` | `unknown` | Value of the `worldParameters` config option |
| `config` | `any` | Cucumber config object |
| `supportCodeLibrary` | `any` | Access to the loaded support code library |

**`attach(data, mediaTypeOrOptions?)`** — same signature as in Cucumber:

```typescript
await this.attach('plain text');                                         // text/plain
await this.attach(JSON.stringify(data), 'application/json');
await this.attach(screenshot, { mediaType: 'image/png', fileName: 'screenshot.png' });
await this.attach(base64Png, 'image/png;base64');                        // base64 string is decoded
await this.attach(fs.createReadStream('report.pdf'), 'application/pdf');  // streams are supported
```

**`executeStep(text, argument?)`** — programmatically invoke a step by its text. `argument` is passed as a doc string (`string`) or data table (`string[][]` or `DataTable`); any other value is passed as an extra parameter. Each executed step is shown in the report as a nested step of the calling step, and its `{ timeout }` option applies:

```typescript
When('composite step', async function (this: PlaywrightWorld) {
    await this.executeStep('I open the home page');
    await this.executeStep('I click "Login"');
    await this.executeStep('I fill the form', [['username', 'alice'], ['password', 'secret']]);
    await this.executeStep('I set the body', '{"key": "value"}');
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

### Typed Steps

`withWorld<World>()` returns step and hook functions with `this` typed as your world, so you don't need a `this: MyWorld` annotation in every step:

```typescript
import { withWorld } from '@qavajs/playwright-runner-adapter';

const { Given, When, Then, Before, After } = withWorld<MyWorld>();

When('I open {string}', async function (url: string) {
    await this.page.goto(url); // `this` is MyWorld
});
```

Cucumber's generic form works too: `When<MyWorld>('I open {string}', async function (url) { ... })`.

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

Each non-empty line in the returned string is executed as an individual step against the current world and shown as a nested step in the report. Steps run sequentially; a failure stops the sequence.

Steps in a template can have data tables and doc strings, written the same way as in feature files:

```typescript
When('I register as {string}', Template((username: string) => `
    I fill the form
      | username | ${username} |
      | password | secret      |
    I set the body
      """
      {"user": "${username}"}
      """
`));
```

---

## Step Results

Steps and hooks follow Cucumber semantics:

- a step returning `'pending'` fails the scenario (or marks it as `fixme` with `strict: false`)
- a step or `Before` hook returning `'skipped'` skips the rest of the scenario and marks it as skipped
- an undefined step fails the scenario with its location in the feature file and a ready-to-paste snippet:

```
Step 'I have 5 "apples"' is not defined
  at /project/features/cart.feature:12

Implement it with the following snippet:

When('I have {int} {string}', async function (int, string) {
  // Write code here that turns the phrase above into concrete actions
  return 'pending';
});
```

`After` and `AfterStep` hooks receive the actual status (`PASSED`, `FAILED`, `SKIPPED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`), including failures in `Before` hooks and soft assertions.

---

## Filtering Tests

### Tag Expressions

The simplest way to select scenarios is the `tags` [config option](#configuration-reference) and the `CUCUMBER_TAGS` environment variable. They are evaluated against the scenario's Gherkin tags, and scenarios that don't match are not created at all.

Use `tags()` to translate a Cucumber tag expression into a Playwright `grep` pattern:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { tags } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    grep: tags('@smoke and not @slow'),
});
```

Supports the full [Cucumber tag expression syntax](https://github.com/cucumber/tag-expressions): `and`, `or`, `not`, parentheses.

Invalid expressions fail fast with an error naming their source (`tags()`, the `tags` option or `CUCUMBER_TAGS`). Tags written without `@` (e.g. `smoke and not @wip`) are rejected too, because they would silently match nothing.

`tags()` is evaluated against Playwright's grep string (titles + tags), so, like Playwright itself, it treats `@words` in feature and scenario titles as tags. Use the `tags` config option when that matters.

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

## Annotations, Modifiers and Locks

Gherkin tags are translated into Playwright [test details](https://playwright.dev/docs/test-annotations). The special tags below are consumed: they are removed from the scenario's Playwright tags (and the `tags` annotation), so they don't show up as tags in reports and can't be matched with `grep` / `tags()`. All other tags are kept as Playwright tags.

| Tag | Playwright equivalent |
|---|---|
| `@skip()` / `@skip(reason)` | skips the scenario — fixtures are not set up |
| `@fixme()` / `@fixme(reason)` | same as skip, marks the scenario as to be fixed |
| `@fail()` / `@fail(reason)` | scenario passes only if it fails |
| `@slow()` / `@slow(reason)` | triples the timeout |
| `@lock(name)` | `lock: 'name'` — scenarios sharing a lock never run concurrently |
| `@lock(-exclusive-)` | built-in exclusive lock — runs only when no other test is running |
| `@annotation(type,description)` | `annotation: { type, description }` — description is optional: `@annotation(flaky)` |
| `@timeout(ms)` | sets the test timeout, e.g. `@timeout(60000)`; overrides `@slow()`, the last tag wins (scenario over feature) |
| `@retries(n)` | number of retries for all scenarios of the feature — **Feature only**, using it on a Rule or Scenario is an error |

Modifiers are passed as annotations of type `skip`, `fixme`, `fail`, `slow`, which Playwright applies like `test.skip()` and the other modifiers, and the optional reason is shown in the report. Plain tags such as `@skip` or `@slow` are ordinary tags and do nothing. Tags set on a `Feature` or `Rule` apply to all its scenarios.

> Gherkin tags may not contain whitespace, so write `@annotation(issue,JIRA-123)` without a space after the comma. Everything after the first comma is the description.

```gherkin
@lock(user-settings)
Feature: user settings

  @annotation(issue,JIRA-123)
  Scenario: update settings
    When I update settings

  @lock(-exclusive-) @slow(full-reset)
  Scenario: reset all data
    When I reset the database
```

Locks are a lighter alternative to splitting scenarios into a separate serial project (see [Parallelism](#parallelism)): only scenarios sharing the same lock are serialized, everything else stays parallel. Locks require `@playwright/test` 1.65+.

Runtime annotations can be added from steps via `this.test.info().annotations.push({ type, description })`.

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

To run a single feature or scenario use `CUCUMBER_PATHS=features/login.feature npx playwright test` or `npx playwright test -g "Feature name"`. Passing a `.feature` path as a Playwright CLI argument does not work, because all scenarios are defined in `cucumber.config.ts`.

> To get the current worker index inside a step, use `this.test.info().parallelIndex`.

---

## Reports

- Scenarios are reported at their location in the `.feature` file (Scenario Outline examples point to their example row), so reporters and `--list` show `features/login.feature:12:3`.
- Steps point to their step definition; set `stepLocation: 'feature'` to point them to the step line in the `.feature` file instead.
- Steps are reported with a short preview of their argument: `I submit the form [DataTable: | field | value | | username | alice |]`.
- Features with the same name in different files get the file path appended to their title to keep test titles unique.

---

## Entrypoints and JavaScript Support

The package is compiled to CommonJS JavaScript with type declarations, so it works from TypeScript and plain JavaScript, with `require` and `import`. It has two entrypoints with the same API:

| Entrypoint | Difference |
|---|---|
| `@qavajs/playwright-runner-adapter` | ships source maps |
| `@qavajs/playwright-runner-adapter/js` | the same build without source maps — stack traces show the compiled `.js` files |

Plain JavaScript projects don't need any TypeScript setup with either entrypoint:

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

## Timeouts

- The Playwright test timeout (`timeout` in `playwright.config.ts`, `@timeout(ms)` or `@slow()` tags) limits the whole scenario.
- A step or hook `{ timeout }` option limits that single step or hook, as in Cucumber:

```typescript
When('I upload a big file', { timeout: 60_000 }, async function () { /* ... */ });
Before({ tags: '@db', timeout: 10_000 }, async function () { /* ... */ });
```

- `setDefaultTimeout(ms)` sets the timeout for all steps and hooks without their own `{ timeout }`. Unlike Cucumber, there is no 5 second default: without `setDefaultTimeout` only the Playwright test timeout applies. `-1` disables the timeout for a definition.

---

## Supported Cucumber APIs

| API | Supported |
|---|---|
| `Given` / `When` / `Then` / `defineStep` (Cucumber expressions and RegExp) | ✅ |
| `Before` / `After` / `BeforeStep` / `AfterStep` (named, tagged) | ✅ |
| `BeforeAll` / `AfterAll` | ✅ once per worker |
| `setWorldConstructor` | ✅ |
| `defineParameterType` | ✅ |
| `setDefinitionFunctionWrapper` (incl. `wrapperOptions`) | ✅ |
| Data tables, doc strings | ✅ |
| Scenario Outline, Background, Rule (incl. Rule tags) | ✅ |
| Localized Gherkin (`# language: de`) | ✅ |
| `worldParameters`, `tags`, `strict` | ✅ |
| `setDefaultTimeout`, step and hook `{ timeout }` option | ✅ see [Timeouts](#timeouts) |
| `setParallelCanAssign` | ❌ see [Limitations](#limitations) |
| Cucumber formatters (`format`) | ❌ use Playwright [reporters](https://playwright.dev/docs/test-reporters) |

---

## Limitations

- **ES modules** — not supported for Node.js < 22 (where experimental ESM `require` is available). Use CommonJS or TypeScript with `ts-node`.
- **`setParallelCanAssign`** — not supported. Use Playwright [projects](https://playwright.dev/docs/test-projects) with `fullyParallel` to control parallelism.
- **`CUCUMBER_PARALLEL` / `CUCUMBER_TOTAL_WORKERS` / `CUCUMBER_WORKER_ID`** — not supported. Use `this.test.info().parallelIndex` and `this.test.info().workerIndex` instead.

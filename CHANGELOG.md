# Change Log

All notable changes to the "@qavajs/playwright-runner-adapter" will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

:rocket: - new feature

:beetle: - bugfix

:x: - deprecation/removal

:pencil: - chore

:microscope: - experimental

## [2.6.1]
- :x: reverted reporting tests and describe blocks at their location in the `.feature` file (added in 2.5.0): with a single feature file Playwright treated the `.feature` file as the test file, and UI mode ran nothing
- :beetle: tests and describe blocks are located at the `defineConfig(...)` call in the config file. Previously they pointed to the adapter's own file, and when its extension differed from the config file's (e.g. ESM `.js` config, or `.ts` config with the `./js` entrypoint), UI mode ran nothing. Step locations (`stepLocation`) are unchanged
- :pencil: fixtures requested by world `init` are read once at load, and each scenario gets a test function that destructures them, instead of overriding the test function's `toString`. Invalid `init` signatures (no destructuring, rest property) fail at load with a clear error

## [2.6.0]
- :beetle: all `After`, `BeforeStep` and `AfterStep` hooks run even if one of them fails (previously the first failure skipped the rest)
- :beetle: an `After` / `AfterStep` hook failure no longer replaces the error of the failed step in the report
- :beetle: `AfterStep` hooks receive the result of their own step (status and duration) instead of the scenario result
- :beetle: `AfterStep` hooks run when a `BeforeStep` hook fails; the step itself is not run
- :rocket: `executeStep` returns the step's return value and `Template` stops on `'pending'` / `'skipped'` and returns it, so nested steps can make the scenario pending or skipped
- :rocket: `TestWorld` / `PlaywrightWorld` accept a type parameter for `this.parameters`, e.g. `PlaywrightWorld<{ baseUrl: string }>`
- :beetle: a `Before` hook returning `'skipped'` stops the remaining `Before` hooks
- :beetle: `After`, `AfterStep` and `AfterAll` hooks run in reverse definition order, as in Cucumber (previously definition order)
- :rocket: steps that didn't run (after a failed, skipped or pending step or `Before` hook) are shown as skipped steps in the report
- :rocket: undefined step error lists all undefined steps of the scenario with a snippet for each
- :rocket: `executeStep` errors for undefined and ambiguous steps match scenario steps: snippet for undefined steps, patterns for ambiguous ones
- :pencil: scenario execution moved to `ScenarioRunner` (`src/scenarioRunner.ts`) with unit tests
- :pencil: added Biome linter / formatter (`npm run lint`), run in CI; test files are linted, not formatted
- :pencil: e2e checks for hook failure semantics (`test/features/hookFailures.feature`); the adapter's own tests retry only on CI

## [2.5.0]
- :beetle: `requireModules` are now required as modules (e.g. `ts-node/register`) resolved from the current working directory instead of being treated as globs
- :beetle: `worldParameters` config option is passed to the world as `this.parameters`
- :beetle: `this.attach` accepts media type as a string (`attach(data, 'image/png')`), decodes `;base64` media types and supports readable streams
- :beetle: `this.log` attaches text to the report (attachment `log` on the current step) instead of printing to stdout
- :beetle: steps returning `'pending'` fail the scenario (or mark it as fixme with `strict: false`); steps and `Before` hooks returning `'skipped'` skip the scenario
- :beetle: `After` hooks receive `FAILED` status when a `Before` hook fails; soft assertion failures, undefined, ambiguous and pending steps are reported with their own status
- :beetle: features with the same name in different files no longer produce duplicate test titles; unnamed features use the file path as title
- :rocket: undefined step error includes the feature file location and a step definition snippet
- :rocket: added `tags` config option and `CUCUMBER_TAGS` env variable to select scenarios by tag expression evaluated on Gherkin tags
- :rocket: added `CUCUMBER_PATHS` env variable to override feature paths
- :rocket: `executeStep` accepts a doc string (`string`) or data table (`string[][]` / `DataTable`) argument
- :rocket: `Template` supports data tables and doc strings
- :rocket: tests and describe blocks are reported at their location in the `.feature` file
- :rocket: step titles include a preview of their doc string or data table argument
- :rocket: added `@timeout(ms)` tag to set test timeout and `@retries(n)` feature tag to set retries
- :rocket: added `withWorld<World>()` helper returning step and hook functions with typed `this`
- :rocket: added `stepLocation` config option to point steps to the feature file instead of step definitions
- :rocket: step and hook `{ timeout }` option and `setDefaultTimeout` are applied (no implicit 5s default)
- :rocket: steps run by `executeStep` and `Template` are shown as nested steps in the report
- :rocket: invalid tag expressions report their source (`tags()`, `tags` option, `CUCUMBER_TAGS`); tags without `@` are rejected
- :pencil: replaced `glob` dependency with built-in `fs.globSync`; matched files are loaded in sorted order
- :pencil: tests no longer depend on external websites
- :pencil: CI: tests cover all test projects (TS, CommonJS, ESM configs), `CUCUMBER_PATHS` / `CUCUMBER_TAGS`, type checks and a smoke test of the packed package in fresh CommonJS, ESM and TypeScript projects
- :pencil: CI: publish no longer runs e2e tests
- :pencil: README: clarified the difference between the main and `./js` entrypoints
- :pencil: documented and tested supported Cucumber APIs: `defineParameterType`, `setDefinitionFunctionWrapper`, localized Gherkin, Rule tags

## [2.4.0]
- :rocket: added `@lock(name)` tag mapped to playwright test locks (`@lock(-exclusive-)` for the built-in exclusive lock)
- :rocket: added `@skip(reason)`, `@fixme(reason)`, `@fail(reason)`, `@slow(reason)` tags mapped to playwright test modifiers (reason is optional: `@skip()`)
- :rocket: added `@annotation(type,description)` tag mapped to playwright test annotations
- :pencil: special tags (`@lock(...)`, `@annotation(...)`, `@skip(...)`, `@fixme(...)`, `@fail(...)`, `@slow(...)`) are removed from playwright tags
- :pencil: updated `@cucumber/cucumber` to 13, `@cucumber/gherkin` to 42, `@cucumber/tag-expressions` to 11 and `glob` to 14
- :pencil: updated dev dependencies: `@playwright/test` 1.65, `@types/node` 26, `typescript` 7
- :pencil: switched `module` and `moduleResolution` to `nodenext` in `tsconfig.json` and `tsconfig.js.json`
- :x: dropped Node.js 20 support (`engines.node` is now `>=22`); CI tests against Node.js 22, 24 and 26
- :pencil: CI: updated `actions/checkout` and `actions/setup-node` to v7, `mikepenz/action-junit-report` to v6; tests also run on push to `main`, `npm audit` gate for production dependencies, junit report requires tests, e2e tests gate npm publish, publish with provenance

## [2.3.3]
- :beetle: fixed named import for `parse` from `@cucumber/tag-expressions` in `filter.ts`
- :beetle: fixed `attach` method assignment in `PlaywrightWorld` constructor
- :beetle: made `uri` optional in `HookDefinition` and `StepDefinitionMatch` interfaces
- :beetle: improved `executeStep` error handling to preserve original error as `cause`
- :pencil: made `mediaType` optional in `attach` method signature
- :pencil: removed debug log statements from `cucumberAdapter.ts`

## [2.3.2]
- :beetle: fixed fixture type cast in `PlaywrightWorld` to use `any` instead of `Record<string, unknown>`

## [2.3.1]
- :beetle: fixed JUnit report path in PR workflow to use `test/report/report.xml`
- :pencil: added explicit `exports` map in `package.json` for root and `./js` entrypoints
- :pencil: restricted npm package contents via `files` allowlist in `package.json`
- :pencil: added shared type definitions (`CucumberAdapterConfig`, `HookDefinition`, `StepDefinitionMatch`, `SupportCodeLibrary`, `Feature`) replacing `any` throughout the codebase
- :pencil: added explicit `rootDir` to both `tsconfig.json` and `tsconfig.js.json` for forward compatibility with stricter TypeScript versions
- :beetle: improved error messages for undefined and ambiguous steps — now includes feature file URI and all matching step definition locations
- :rocket: added optional `DEBUG=cucumber-adapter` environment variable for step-matching trace logging
- :pencil: added tests for `{int}`, `{float}`, and `{word}` Cucumber parameter types
- :pencil: added tests for Scenario Outlines with multiple `Examples:` tables
- :pencil: added tests for tag-scoped `Before` and `After` hooks
- :pencil: added unit tests for `tags()` and `filter()` utility functions

## [2.3.0]
- :rocket: simplified adapter by moving hook into test

## [2.2.0]
- :rocket: added `request` into default fixture import
- :beetle: fixed `attach` method type

## [2.1.0]
- :rocket: made declaration of beforeAll/afterAll hooks optional to enable pure parallelism

## [2.0.1]
- :beetle: removed stacktrace override to proper location calculation

## [2.0.0]
Breaking Change:
- :rocket: reworked cucumber-playwright connection mechanism

#### Create cucumber config file
Set `paths` and `require` properties
```typescript
// cucumber.config.ts
import { defineConfig } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts']
})
```
#### Set testMatch property
Set `testMatch` to adapter
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testMatch: 'cucumber.config.ts'
});
```

## [1.10.0]
- :rocket: improved multi line and data table step logging

## [1.9.1]
- :beetle: fixed bug with custom fixture assignment

## [1.9.0]
- :rocket: changed logic to construct world in every test case

## [1.8.1]
- :rocket: updated dependencies

## [1.8.0]
- :rocket: added `gherkinDocument` to hooks parameter

## [1.7.1]
- :beetle: fixed `result` property in `After` and `AfterStep` hooks

## [1.7.0]
- :rocket: added `filter` grep utility function
```typescript
import { filter } from '@qavajs/playwright-runner-adapter';
export default defineConfig({
    grep: filter(name => name.includes('login test'))
});
```
- :rocket: expose `uri` test annotation

## [1.6.0]
- :rocket: added `Template` utility function
```typescript
import { When, Template } from '@qavajs/playwright-runner-adapter';

When('I click {string} and verify {string}', Template((locator, expected) => `
    I click '${locator}'
    I expect '${locator} > Value' to equal '${expected}'
`));
```

## [1.5.2]
- :beetle: fixed issue with `this.attach`, made `details` parameter as optional

## [1.5.1]
- :rocket: update `tags` method via extending `RegExp`

## [1.5.0]
- :rocket: added export of basic `TestWorld`
- :rocket: update dependencies

## [1.4.2]
- :beetle: fixed issue with duplicate scenarios

## [1.4.1]
- :beetle: fixed issue that prevented to properly use soft assertions

## [1.4.0]
- :rocket: moved `@cucumber/cucumber` to dependencies
- :beetle: removed duplicated tags

## [1.3.0]
- :rocket: added `tags` function to translate cucumber tag expression to grep parameter
- :rocket: improved tags displaying in annotation

## [1.2.0]
- :rocket: reworked hooks via playwright hooks
- :rocket: display proper location in sources

## [1.1.1]
- :beetle: fixed issue with After hooks execution in case of failed test

## [1.1.0]
- :rocket: improved BeforeStep/AfterStep logging
- :beetle: fixed BeforeAll/AfterAll behavior

## [1.0.1]
- :pencil: updated dependencies
- :rocket: renamed adapter spec to cucumber.spec.ts

## [1.0.0]
- :rocket: added `executeStep` method to world to execute step definitions programmatically
```typescript
When('I do smth complex', async function() {
    await this.executeStep(`I type 'username' to 'Username Input'`);
    await this.executeStep(`I type 'password' to 'Password Input'`);
    await this.executeStep(`I click 'Login Button'`);
    await this.executeStep(`I fill following fields`, new DataTable([
        [ 'Order', '123' ],
        [ 'Delivery Location', 'New York' ]
    ]))
});
```
- :rocket: added reference to supportCodeLibrary to cucumber world

## [0.7.0]
- :rocket: added support of named hooks

## [0.6.1]
- :beetle: make params in hooks closer to cucumber types

## [0.6.0]
- :rocket: added test case accessor to BeforeStep/AfterStep hooks

## [0.5.0]
- :rocket: updated gherkin dependency
- :rocket: added _expect_ to default world

## [0.4.0]
- :rocket: added support of _requireModules_ option
- :rocket: improved _defineCucumber_ function to encapsulate adapter path
- :beetle: updated typing for _init_ property of PlaywrightWorld

## [0.3.0]
- :rocket: added _defineCucumber_ util function
- :rocket: added logic to process duplicates
  
## [0.2.0]
- :rocket: updated fixture implementation

## [0.1.0]
- :rocket: initial implementation

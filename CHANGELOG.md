# Change Log

All notable changes to the "@qavajs/playwright-runner-adapter" will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

:rocket: - new feature

:beetle: - bugfix

:x: - deprecation/removal

:pencil: - chore

:microscope: - experimental

## [2.4.0]
- :rocket: added support of Cucumber 13

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

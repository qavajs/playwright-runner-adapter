# Change Log

All notable changes to the "@qavajs/playwright-runner-adapter" will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

:rocket: - new feature

:beetle: - bugfix

:x: - deprecation/removal

:pencil: - chore

:microscope: - experimental

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

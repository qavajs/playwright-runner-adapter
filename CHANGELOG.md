# Change Log

All notable changes to the "@qavajs/playwright-runner-adapter" will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

:rocket: - new feature
:beetle: - bugfix
:x: - deprecation/removal
:pencil: - chore
:microscope: - experimental

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

[![npm version](https://badge.fury.io/js/@qavajs%2Fplaywright-runner-adapter.svg)](https://badge.fury.io/js/@qavajs%2Fplaywright-runner-adapter)

# @qavajs/playwright-runner-adapter
Adapter to run cucumberjs tests via playwright test runner

## Installation

`npm install @qavajs/playwright-runner-adapter`

## Basic Configuration

### Create cucumber config file
Set _paths_ and _require_ properties
```typescript
export default {
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts']
}
```
### Set testDir
Set testDir to adapter
```typescript
import { defineCucumber } from '@qavajs/playwright-runner-adapter';

defineCucumber({
    config: 'test/cucumber.ts',
    profile: 'default'
});

export default defineConfig({
    testDir: resolve('node_modules/@qavajs/playwright-runner-adapter/adapter')
});
```

## Advanced Configuration
### Customizing test instance
Custom test instance can be passed to world constructor as _test_ property. 
And then fixtures can be connected with world instance via _init_ property.
```typescript
import { test as base } from '@playwright/test';
import { SettingsPage } from './settings-page';
import { setWorldConstructor } from '@cucumber/cucumber';
import { PlaywrightWorld } from '@qavajs/playwright-runner-adapter/PlaywrightWorld';

type MyFixtures = {
    settingsPage: SettingsPage;
};

const customTest = base.extend<MyFixtures>({
    settingsPage: async ({ page }, use) => {
        await use(new SettingsPage(page));
    },
});

class ExtendedPlaywrightWorld extends PlaywrightWorld {
    settingsPage: SettingsPage;
    constructor(options: any) {
        super(options);
    }
    
    // set test property with extened one
    test = customTest;
    
    // init arrow function connects fixtures with Cucumber world instance
    init = ({ settingsPage }) => {
        this.settingsPage = settingsPage;
    }

}
```

## Limitation
- ES modules are not supported (at least for node <= 22, where experimental ESM require is introduced)



[![npm version](https://badge.fury.io/js/@qavajs%2Fplaywright-runner-adapter.svg)](https://badge.fury.io/js/@qavajs%2Fplaywright-runner-adapter)

# @qavajs/playwright-runner-adapter
Adapter to run cucumber tests via playwright test runner

## Installation

```
npm install @qavajs/playwright-runner-adapter
```

## Basic Configuration

### Create cucumber config file
Set `paths` and `require` properties
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

export default defineConfig({
    testDir: defineCucumber({
        config: 'test/cucumber.ts',
        profile: 'default'
    })
});
```

## Advanced Configuration
### Customizing test instance
Custom test instance can be passed to world constructor as `test` property. 
And then fixtures can be connected with world instance via `init` function-property.
```typescript
import { test as base, expect as baseExpect } from '@playwright/test';
import { SettingsPage } from './settings-page';
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
    async customMatcher() {
        // implementation
    }
});

class ExtendedPlaywrightWorld extends PlaywrightWorld {
    settingsPage: SettingsPage;
    constructor(options: any) {
        super(options);
    }
    
    // set test property with extened one
    test = customTest;
    expect = customExpect;
    
    // init arrow function connects fixtures with Cucumber world instance
    init = ({ settingsPage }) => {
        this.settingsPage = settingsPage;
    }

}
```

### Tag expression and filter
It is possible to use regular tag expressions via `tags` util function

```typescript
import { tags } from '@qavajs/playwright-runner-adapter';
export default defineConfig({
    grep: tags('@oneTag and @anotherTag')
});
```

or filter tests by predicate

```typescript
import { filter } from '@qavajs/playwright-runner-adapter';
export default defineConfig({
    grep: filter(name => name.includes('login test'))
});
```

## Limitation
- ES modules are not supported (at least for node <= 22, where experimental ESM require is introduced)
- `setParallelCanAssign` is not supported (use playwright projects and `fullyParallel` property)
- `CUCUMBER_PARALLEL`, `CUCUMBER_TOTAL_WORKERS` and `CUCUMBER_WORKER_ID` env vars are not supported. Use built-in `info()` method of world property `test`



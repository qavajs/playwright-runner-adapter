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
export default defineConfig({
    testDir: resolve('node_modules/@qavajs/playwright-runner-adapter/adapter')
});
```
### Add cucumber config
Set CONFIG and PROFILE environment variables e.g via dotenv library
```dotenv
CONFIG=test/cucumber.ts
PROFILE=default
```

## Advanced Configuration
### Customizing test instance



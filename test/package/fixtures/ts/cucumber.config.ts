import { defineConfig } from '@qavajs/playwright-runner-adapter';

export default defineConfig({
    paths: ['features/*.feature'],
    require: ['steps/*.ts']
});

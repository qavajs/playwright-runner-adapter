import { defineConfig } from '../../src';

export default defineConfig({
    paths: ['test/features/rule.feature'],
    require: ['test/step_definitions/*.ts'],
    requireModules: ['./test/support/setup.ts'],
    worldParameters: { baseUrl: 'https://example.com' }
});

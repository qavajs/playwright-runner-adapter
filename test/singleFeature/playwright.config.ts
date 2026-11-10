import { defineConfig } from '@playwright/test';

/**
 * Config with a single feature file, used by unit tests to check how playwright locates the config file suite
 */
export default defineConfig({
    testDir: '.',
    testMatch: 'singleFeature.config.ts'
});

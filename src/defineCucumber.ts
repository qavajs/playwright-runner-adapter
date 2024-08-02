import { resolve } from 'node:path';

type CucumberConfig = {
    config: string,
    profile?: string,
    adapter?: string
}

/**
 * Define cucumber config in playwright config
 * @param {CucumberConfig} config
 * @example
 * export default defineConfig({
 *     testDir: defineCucumber({
 *         config: 'cucumber.ts',
 *         profile: 'chrome', // optional
 *         adapter: 'path/to/adapter' // optional
 *     }),
 * })
 */
export function defineCucumber(config: CucumberConfig): string {
    process.env.CONFIG = config.config;
    process.env.PROFILE = config.profile ?? 'default';
    return config.adapter ?? resolve('./node_modules/@qavajs/playwright-runner-adapter/adapter');
}

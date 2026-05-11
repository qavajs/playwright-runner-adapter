import type { TestWorld } from './PlaywrightWorld';

/**
 * Define template step
 * @param {string} scenario - multiline string with steps
 * @example
 * When('I click {string} and verify {string}', Template((locator, expected) => `
 *     I click '${locator}'
 *     I expect '${locator} > Value' to equal '${expected}'
 * `));
 */
export function Template(scenario: (...args: unknown[]) => string) {
    return new Proxy(scenario, {
        apply: async function (template: (...args: unknown[]) => string, world: TestWorld, args: unknown[]) {
            const scenario = template(...args);
            const steps = scenario
                .split('\n')
                .map(step => step.trim())
                .filter(Boolean);
            for (const step of steps) {
                await world.executeStep(step);
            }
        },
    });
}
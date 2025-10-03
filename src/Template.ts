/**
 * Define template step
 * @param {string} scenario - multiline string with steps
 * @example
 * When('I click {string} and verify {string}', Template((locator, expected) => `
 *     I click '${locator}'
 *     I expect '${locator} > Value' to equal '${expected}'
 * `));
 */
export function Template(scenario: (...args: any[]) => string) {
    return new Proxy(scenario, {
        apply: async function (template: (...args: string[]) => string, world: { executeStep: (step: string) => Promise<void> }, args: any[]) {
            const scenario = template(...args) ;
            const steps = scenario
                .split('\n')
                .map(step => step.trim())
                .filter(step => step);
            for (const step of steps) {
                await world.executeStep(step);
            }
        },
    })
}
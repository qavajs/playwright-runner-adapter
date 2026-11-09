import type { TestWorld } from './PlaywrightWorld';

export interface TemplateStep {
    text: string;
    argument?: string | string[][];
}

const DOC_STRING_DELIMITERS = ['"""', '```'];

function parseRow(line: string): string[] {
    const content = line.replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    return content.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
}

function stripIndent(line: string, indent: number): string {
    const leading = line.length - line.trimStart().length;
    return line.slice(Math.min(indent, leading));
}

/**
 * Parse template text into steps. Supports data tables (`| a | b |` lines)
 * and doc strings (`"""` or ``` blocks) placed after a step.
 */
export function parseTemplate(scenario: string): TemplateStep[] {
    const lines = scenario.split('\n');
    const steps: TemplateStep[] = [];
    const previousStep = (line: string) => {
        const step = steps.at(-1);
        if (!step) throw new Error(`Template argument "${line.trim()}" must follow a step`);
        return step;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) continue;
        const delimiter = DOC_STRING_DELIMITERS.find(d => trimmed.startsWith(d));
        if (delimiter) {
            const step = previousStep(line);
            const indent = line.indexOf(delimiter);
            const content: string[] = [];
            for (i++; i < lines.length && lines[i].trim() !== delimiter; i++) {
                content.push(stripIndent(lines[i], indent));
            }
            step.argument = content.join('\n');
            continue;
        }
        if (trimmed.startsWith('|')) {
            const step = previousStep(line);
            if (!Array.isArray(step.argument)) step.argument = [];
            step.argument.push(parseRow(trimmed));
            continue;
        }
        steps.push({ text: trimmed });
    }
    return steps;
}

/**
 * Define template step.
 * Steps run one by one; a step returning `'pending'` or `'skipped'` stops the template
 * and the template step returns the same value.
 * @param {string} scenario - multiline string with steps; steps can have data tables and doc strings
 * @example
 * When('I click {string} and verify {string}', Template((locator, expected) => `
 *     I click '${locator}'
 *     I expect '${locator} > Value' to equal '${expected}'
 *     I fill form
 *       | name | John |
 * `));
 */
export function Template(scenario: (...args: any[]) => string) {
    return new Proxy(scenario, {
        apply: async (template: (...args: unknown[]) => string, world: TestWorld, args: unknown[]) => {
            for (const step of parseTemplate(template(...args))) {
                const returned = await world.executeStep(step.text, step.argument);
                if (returned === 'pending' || returned === 'skipped') return returned;
            }
        }
    });
}

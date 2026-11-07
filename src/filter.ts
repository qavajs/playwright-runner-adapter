import { parse } from '@cucumber/tag-expressions';

const OPERATORS = new Set(['and', 'or', 'not']);

/**
 * Parse cucumber tag expression with an error naming its source.
 * Also rejects tags without `@` (e.g. `smoke`), which parse fine but never match any scenario.
 * @param expression - tag expression
 * @param source - where the expression comes from, used in error messages
 */
export function parseTagExpression(expression: string, source: string): ReturnType<typeof parse> {
    let node: ReturnType<typeof parse>;
    try {
        node = parse(expression);
    } catch (err) {
        throw new Error(`Invalid tag expression in ${source}: ${(err as Error).message}`, { cause: err });
    }
    const invalidTags = expression
        .replace(/\\./g, '')
        .split(/[\s()]+/)
        .filter(token => token && !OPERATORS.has(token) && !token.startsWith('@'));
    if (invalidTags.length > 0) {
        throw new Error(
            `Invalid tag expression in ${source}: "${expression}". ` +
            `Tags must start with '@': ${invalidTags.map(tag => `'${tag}' → '@${tag}'`).join(', ')}`
        );
    }
    return node;
}

class TagExpression extends RegExp {
    private expressionNode: {
        evaluate(variables: string[]): boolean;
    };

    constructor(private tagExpression: string) {
        super('');
        this.expressionNode = parseTagExpression(this.tagExpression, 'tags()');
    }

    test(testName: string) {
        const tokens = testName.split(/\s+/);
        return this.expressionNode.evaluate(tokens);
    }
}

/**
 * Translate cucumber tag expression to playwright grep
 * @param {string} tagExpression
 * @example
 * import { tags } from '@qavajs/playwright-runner-adapter';
 * export default defineConfig({
 *     grep: tags('@oneTag and @anotherTag')
 * });
 */
export function tags(tagExpression: string): RegExp {
    return new TagExpression(tagExpression);
}

class Filter extends RegExp {
    constructor(private predicate: (testName: string) => boolean) {
        super('');
        this.predicate = predicate;
    }

    test(testName: string) {
        return this.predicate(testName);
    }
}

/**
 * Filter test cases by name
 * @param {(testName: string) => boolean} predicate
 * import { filter } from '@qavajs/playwright-runner-adapter';
 * export default defineConfig({
 *     grep: filter(name => name.includes('login test'))
 * });
 */
export function filter(predicate: (testName: string) => boolean): RegExp {
    return new Filter(predicate);
}
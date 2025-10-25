import parse from '@cucumber/tag-expressions';

class TagExpression extends RegExp {
    private expressionNode: {
        evaluate(variables: string[]): boolean;
    };

    constructor(private tagExpression: string) {
        super('');
        this.expressionNode = parse(this.tagExpression);
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
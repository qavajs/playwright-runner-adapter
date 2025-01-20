import parse from '@cucumber/tag-expressions'

/**
 * Translate cucumber tag expression to playwright grep
 * @param {string} tagExpression
 * @example
 * import { tags } from '@qavajs/playwright-runner-adapter';
 * export default defineConfig({
 *     grep: tags('@oneTag and @anotherTag')
 * })
 */
export function tags(tagExpression: string): RegExp {
    const expressionNode = parse(tagExpression);
    return {
        test(testName: string) {
            const tokens = testName.split(' ');
            return expressionNode.evaluate(tokens);
        }
    } as RegExp;
}

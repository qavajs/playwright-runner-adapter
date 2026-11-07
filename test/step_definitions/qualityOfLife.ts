import { defineParameterType, setDefaultTimeout, setDefinitionFunctionWrapper, withWorld } from '../../adapter';
import type { PlaywrightWorld } from '../../adapter';

class TypedWorld {
    typedValue?: string;
    wrapped?: boolean;
}
type World = PlaywrightWorld & TypedWorld;

const { When, Then } = withWorld<World>();

When('typed step sets value {string}', async function (value: string) {
    this.typedValue = value;
});

Then('typed value is {string}', async function (value: string) {
    this.expect(this.typedValue).toBe(value);
});

Then('test timeout is {int}', async function (timeout: number) {
    this.expect(this.test.info().timeout).toBe(timeout);
});

defineParameterType({
    name: 'color',
    regexp: /red|green|blue/,
    transformer: (color: string) => color.toUpperCase()
});

Then('color {color} is transformed to {string}', async function (color: string, expected: string) {
    this.expect(color).toBe(expected);
});

setDefinitionFunctionWrapper((fn: (...args: unknown[]) => unknown, options?: { markWrapped?: boolean }) => {
    if (!options?.markWrapped) return fn;
    return function (this: World, ...args: unknown[]) {
        this.wrapped = true;
        return fn.apply(this, args);
    };
});

When('wrapped step', { wrapperOptions: { markWrapped: true } }, async function () {});

Then('wrapper was applied', async function () {
    this.expect(this.wrapped).toBe(true);
});

Then('scenario has tags {string}', async function (tags: string) {
    this.expect(this.test.info().tags).toEqual(this.expect.arrayContaining(tags.split(' ')));
});

setDefaultTimeout(20_000);

Then('default timeout is {int}', async function (timeout: number) {
    this.expect(this.supportCodeLibrary.defaultTimeout).toBe(timeout);
});

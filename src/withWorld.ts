import {
    After,
    AfterStep,
    Before,
    BeforeStep,
    defineStep,
    Given,
    Then,
    When,
    type ITestCaseHookParameter,
    type ITestStepHookParameter
} from '@cucumber/cucumber';

type StepPattern = string | RegExp;
type StepFunction<World> = (this: World, ...args: any[]) => unknown;
type HookFunction<World, Parameter> = (this: World, parameter: Parameter) => unknown;

export interface StepOptions {
    timeout?: number;
    wrapperOptions?: unknown;
}

export interface HookOptions {
    name?: string;
    tags?: string;
    timeout?: number;
}

export interface DefineStep<World> {
    (pattern: StepPattern, code: StepFunction<World>): void;
    (pattern: StepPattern, options: StepOptions, code: StepFunction<World>): void;
}

export interface DefineHook<World, Parameter> {
    (code: HookFunction<World, Parameter>): void;
    (tags: string, code: HookFunction<World, Parameter>): void;
    (options: HookOptions, code: HookFunction<World, Parameter>): void;
}

export interface TypedSupportCode<World> {
    Given: DefineStep<World>;
    When: DefineStep<World>;
    Then: DefineStep<World>;
    defineStep: DefineStep<World>;
    Before: DefineHook<World, ITestCaseHookParameter>;
    After: DefineHook<World, ITestCaseHookParameter>;
    BeforeStep: DefineHook<World, ITestStepHookParameter>;
    AfterStep: DefineHook<World, ITestStepHookParameter>;
}

/**
 * Get step and hook definition functions with `this` typed as the given world,
 * so step definitions don't need `this: MyWorld` annotation
 * @example
 * const { Given, When, Before } = withWorld<MyWorld>();
 * When('I open {string}', async function (url: string) {
 *     await this.page.goto(url); // `this` is MyWorld
 * });
 */
export function withWorld<World>(): TypedSupportCode<World> {
    return {
        Given,
        When,
        Then,
        defineStep,
        Before,
        After,
        BeforeStep,
        AfterStep
    } as unknown as TypedSupportCode<World>;
}

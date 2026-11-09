import { type APIRequestContext, type Browser, type BrowserContext, type Page, test, expect } from '@playwright/test';
import type { AttachFn, CucumberAdapterConfig, SupportCodeLibrary, WorldOptions } from './types';
import { stepTitle, toPickleArgument } from './gherkin';
import { ambiguousStepMessage, findStepDefinitions, undefinedStepsMessage } from './stepDefinitions';
import { resolveTimeout, runWithTimeout } from './timeout';

/**
 * Base world
 * @typeParam Parameters - type of `worldParameters` config option, available as `this.parameters`
 */
export class TestWorld<Parameters = unknown> {
    log!: (data: unknown) => void;
    attach!: AttachFn;
    parameters!: Parameters;
    config!: CucumberAdapterConfig;
    supportCodeLibrary!: SupportCodeLibrary;
    test = test;
    expect = expect;

    constructor(options: WorldOptions<Parameters>) {
        this.log = options.log ?? console.log;
        this.attach = options.attach!;
        this.parameters = options.parameters as Parameters;
        this.supportCodeLibrary = options.supportCodeLibrary!;
        this.config = options.config!;
    }

    /**
     * Execute step by its text.
     * Unlike steps of a scenario, BeforeStep / AfterStep hooks are not run for executed steps.
     * @param text - step text
     * @param argument - doc string (`string`), data table (`string[][]` or `DataTable`) or any extra parameter
     * @returns value returned by the step; return it from the calling step to propagate `'pending'` or `'skipped'`
     */
    async executeStep(this: TestWorld<Parameters>, text: string, argument?: unknown): Promise<unknown> {
        const { argument: pickleArgument, extra } = toPickleArgument(argument);
        const steps = findStepDefinitions(this.supportCodeLibrary, text);
        if (steps.length === 0) {
            throw new Error(
                undefinedStepsMessage(this.supportCodeLibrary, [{ pickleStep: { text, argument: pickleArgument } }])
            );
        }
        if (steps.length > 1) throw new Error(ambiguousStepMessage(text, steps));
        const step = steps[0];
        const location = step.uri ? { file: step.uri, line: step.line, column: 1 } : undefined;
        // reported as a nested step, so failures inside composite steps point to the exact inner step
        return this.test.step(
            stepTitle({ text, argument: pickleArgument }),
            async () => {
                const { parameters } = await step.getInvocationParameters({
                    step: { text, argument: pickleArgument },
                    world: this
                });
                const args = extra === undefined ? parameters : [...parameters, extra];
                try {
                    return await runWithTimeout(
                        () => step.code.apply(this, args),
                        resolveTimeout(step, this.supportCodeLibrary.defaultTimeout),
                        `Step '${text}' timed out after {timeout} ms\n  at ${step.uri}:${step.line}`
                    );
                } catch (err) {
                    throw new Error(`Step failed: ${text}`, { cause: err });
                }
            },
            { location }
        );
    }
}

export class PlaywrightWorld<Parameters = unknown> extends TestWorld<Parameters> {
    page!: Page;
    context!: BrowserContext;
    browser!: Browser;
    browserName!: string;
    request!: APIRequestContext;

    // Cast preserves the destructured param form that Playwright reads via toString() to discover fixtures
    init = (({
        browser,
        context,
        page,
        request
    }: {
        browser: Browser;
        context: BrowserContext;
        page: Page;
        request: APIRequestContext;
    }) => {
        this.browser = browser;
        this.context = context;
        this.page = page;
        this.request = request;
    }) as (fixtures: any) => void;
}

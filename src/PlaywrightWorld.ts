import { APIRequestContext, Browser, BrowserContext, Page, test, expect } from '@playwright/test';
import type { AttachFn, CucumberAdapterConfig, SupportCodeLibrary, WorldOptions } from './types';
import { stepTitle, toPickleArgument } from './gherkin';
import { resolveTimeout, runWithTimeout } from './timeout';

export class TestWorld {
    log!: (data: unknown) => void;
    attach!: AttachFn;
    parameters!: unknown;
    config!: CucumberAdapterConfig;
    supportCodeLibrary!: SupportCodeLibrary;
    test = test;
    expect = expect;

    constructor(options: WorldOptions) {
        this.log = options.log ?? console.log;
        this.attach = options.attach!;
        this.parameters = options.parameters;
        this.supportCodeLibrary = options.supportCodeLibrary!;
        this.config = options.config!;
    }

    /**
     * Execute step by its text
     * @param text - step text
     * @param argument - doc string (`string`), data table (`string[][]` or `DataTable`) or any extra parameter
     */
    async executeStep(this: TestWorld, text: string, argument?: unknown) {
        const steps = this.supportCodeLibrary.stepDefinitions
            .filter(s => s.matchesStepName(text));
        if (steps.length === 0) throw new Error(`Step "${text}" is not defined`);
        if (steps.length > 1) {
            const locations = steps.map(s => `  ${s.uri}:${s.line}`).join('\n');
            throw new Error(`Step "${text}" matches multiple step definitions:\n${locations}`);
        }
        const step = steps[0];
        const { argument: pickleArgument, extra } = toPickleArgument(argument);
        const location = step.uri ? { file: step.uri, line: step.line, column: 1 } : undefined;
        // reported as a nested step, so failures inside composite steps point to the exact inner step
        await this.test.step(stepTitle({ text, argument: pickleArgument }), async () => {
            const { parameters } = await step.getInvocationParameters({ step: { text, argument: pickleArgument }, world: this });
            const args = extra === undefined ? parameters : [...parameters, extra];
            try {
                await runWithTimeout(
                    () => step.code.apply(this, args),
                    resolveTimeout(step, this.supportCodeLibrary.defaultTimeout),
                    `Step '${text}' timed out after {timeout} ms\n  at ${step.uri}:${step.line}`
                );
            } catch (err) {
                throw new Error(`Step failed: ${text}`, { cause: err });
            }
        }, { location });
    }
}

export class PlaywrightWorld extends TestWorld {
    page!: Page;
    context!: BrowserContext;
    browser!: Browser;
    browserName!: string;
    request!: APIRequestContext;

    // Cast preserves the destructured param form that Playwright reads via toString() to discover fixtures
    init = (({ browser, context, page, request }: { browser: Browser; context: BrowserContext; page: Page; request: APIRequestContext }) => {
        this.browser = browser;
        this.context = context;
        this.page = page;
        this.request = request;
    }) as (fixtures: any) => void;
}

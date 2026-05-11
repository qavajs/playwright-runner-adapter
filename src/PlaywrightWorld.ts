import { APIRequestContext, Browser, BrowserContext, Page, test, expect } from '@playwright/test';
import type { CucumberAdapterConfig, SupportCodeLibrary, WorldOptions } from './types';

export class TestWorld {
    log!: (data: unknown) => void;
    attach!: (data: unknown, details?: { fileName?: string; mediaType?: string }) => Promise<void>;
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

    async executeStep(this: TestWorld, text: string, extraParam?: unknown) {
        const steps = this.supportCodeLibrary.stepDefinitions
            .filter(s => s.matchesStepName(text));
        if (steps.length === 0) throw new Error(`Step "${text}" is not defined`);
        if (steps.length > 1) {
            const locations = steps.map(s => `  ${s.uri}:${s.line}`).join('\n');
            throw new Error(`Step "${text}" matches multiple step definitions:\n${locations}`);
        }
        const step = steps[0];
        const { parameters } = await step.getInvocationParameters({ step: { text }, world: this });
        try {
            await step.code.apply(this, [...parameters, extraParam]);
        } catch (err) {
            throw new Error(`Step failed: ${text}`, { cause: err });
        }
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

import { APIRequestContext, Browser, BrowserContext, Page, test, expect } from '@playwright/test';

/**
 * Cucumber world for playwright adapter
 */
export class PlaywrightWorld {
    page!: Page;
    context!: BrowserContext;
    browser!: Browser;
    browserName!: string;
    request!: APIRequestContext;
    log!: (data: any) => void;
    attach!: (data: any, details?: { fileName?: string, mediaType: string }) => void;
    parameters!: string;
    test = test;
    expect = expect;
    supportCodeLibrary!: any;

    constructor(options: any) {
        this.log = options.log;
        this.attach = options.attach;
        this.parameters = options.parameters;
        this.supportCodeLibrary = options.supportCodeLibrary;
    }

    init: ({ [fixture: string]: any }) = ({ browser, context, page }: { browser: Browser, context: BrowserContext, page: Page }) => {
        this.browser = browser;
        this.context = context;
        this.page = page;
    }

    async executeStep(this: any, text: string, extraParam?: any) {
        const steps = this.supportCodeLibrary.stepDefinitions.filter((s: any) => s.matchesStepName(text));
        if (steps.length === 0) throw new Error(`Step "${text}" is not defined`);
        if (steps.length > 1) throw new Error(`Step "${text}" matches multiple step definitions`);
        const step = steps.pop() as any;
        const { parameters } = await step.getInvocationParameters({ step: { text }, world: this } as any);
        try {
            await step.code.apply(this, [...parameters, extraParam]);
        } catch (err) {
            throw new Error(`${text}\n${err}`);
        }
    }
}

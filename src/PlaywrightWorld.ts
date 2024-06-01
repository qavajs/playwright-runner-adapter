import { APIRequestContext, Browser, BrowserContext, Page, test } from '@playwright/test';

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

    constructor(options: any) {
        this.log = options.log;
        this.attach = options.attach;
        this.parameters = options.parameters;
    }

    init: ({ [fixture: string]: any }) = ({ browser, context, page }: { browser: Browser, context: BrowserContext, page: Page }) => {
        this.browser = browser;
        this.context = context;
        this.page = page;
    }
}

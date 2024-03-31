import {APIRequestContext, Browser, BrowserContext, Page} from '@playwright/test';

export class PlaywrightWorld {
    page!: Page;
    context!: BrowserContext;
    browser!: Browser;
    browserName!: string;
    request!: APIRequestContext;
    log!: (data: any) => void;
    attach!: (data: any, details?: { filename?: string, mediaType: string }) => void;
    parameters!: string;

    constructor(options: any) {
        this.log = options.log;
        this.attach = options.attach;
        this.parameters = options.parameters;
        this.browser = options.browser;
        this.context = options.context;
        this.browserName = options.browserName;
        this.request = options.request;
        this.page = options.page;
    }
}

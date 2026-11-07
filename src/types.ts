import type { GherkinDocument, Pickle } from '@cucumber/messages';
import type { TestType } from '@playwright/test';
import type { Readable } from 'node:stream';

export interface CucumberAdapterConfig {
    /** Glob patterns for feature files. Can be overridden with `CUCUMBER_PATHS` env variable (comma separated). */
    paths: string[];
    /** Glob patterns for step definition files */
    require?: string[];
    /** Module names or paths (resolved from cwd) required before step definitions, e.g. `ts-node/register` */
    requireModules?: string[];
    /** Glob patterns for step definition files */
    import?: string[];
    /** Parameters available in world as `this.parameters` */
    worldParameters?: unknown;
    /** Cucumber tag expression to select scenarios. Combined with `CUCUMBER_TAGS` env variable using `and`. */
    tags?: string;
    /** Fail scenarios with pending steps (default `true`). When `false` such scenarios are marked as fixme. */
    strict?: boolean;
    /**
     * Location reported for steps: `'definition'` (default) points to the step definition code,
     * `'feature'` points to the step line in the feature file
     */
    stepLocation?: 'definition' | 'feature';
    [key: string]: unknown;
}

export interface AttachOptions {
    fileName?: string;
    mediaType?: string;
}

export type AttachData = string | Buffer | Readable;

export type AttachFn = (data: AttachData, mediaTypeOrOptions?: string | AttachOptions) => Promise<void>;

export interface WorldOptions {
    log?: (data: unknown) => void;
    attach?: AttachFn;
    parameters?: unknown;
    supportCodeLibrary?: SupportCodeLibrary;
    config?: CucumberAdapterConfig;
}

export interface HookDefinition {
    uri?: string;
    line: number;
    name?: string;
    options?: { timeout?: number };
    code: (this: unknown, ...args: unknown[]) => unknown;
    appliesToTestCase(testCase: Pickle): boolean;
}

export interface StepDefinitionMatch {
    uri?: string;
    line: number;
    pattern?: string | RegExp;
    options?: { timeout?: number };
    code: (this: unknown, ...args: unknown[]) => unknown;
    matchesStepName(text: string): boolean;
    getInvocationParameters(options: {
        step: { text: string; argument?: unknown };
        world: unknown;
    }): Promise<{ parameters: unknown[] }>;
}

export interface HookResult {
    duration: number;
    message: string | undefined;
    status: string;
    exception: Error | undefined;
}

export interface WorldBase {
    test: TestType<Record<string, unknown>, Record<string, unknown>>;
    init: (fixtures: Record<string, unknown>) => void;
}

export interface SupportCodeLibrary {
    World: new (options: WorldOptions) => WorldBase;
    stepDefinitions: StepDefinitionMatch[];
    parameterTypeRegistry: unknown;
    /** set only when `setDefaultTimeout` is called */
    defaultTimeout?: number;
    beforeTestRunHookDefinitions: HookDefinition[];
    afterTestRunHookDefinitions: HookDefinition[];
    beforeTestCaseHookDefinitions: HookDefinition[];
    afterTestCaseHookDefinitions: HookDefinition[];
    beforeTestStepHookDefinitions: HookDefinition[];
    afterTestStepHookDefinitions: HookDefinition[];
}

export interface Feature {
    feature?: string;
    gherkinDocument: GherkinDocument;
    tests: readonly Pickle[];
    uri: string;
}

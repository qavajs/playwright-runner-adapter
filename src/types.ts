import type { GherkinDocument, Pickle } from '@cucumber/messages';
import type { TestType } from '@playwright/test';

export interface CucumberAdapterConfig {
    paths: string[];
    require?: string[];
    requireModules?: string[];
    import?: string[];
    [key: string]: unknown;
}

export interface WorldOptions {
    log?: (data: unknown) => void;
    attach?: (data: unknown, details?: { fileName?: string; mediaType?: string }) => Promise<void>;
    parameters?: unknown;
    supportCodeLibrary?: SupportCodeLibrary;
    config?: CucumberAdapterConfig;
}

export interface HookDefinition {
    uri: string;
    line: number;
    name?: string;
    code: (this: unknown, ...args: unknown[]) => Promise<void> | void;
    appliesToTestCase(testCase: Pickle): boolean;
}

export interface StepDefinitionMatch {
    uri: string;
    line: number;
    code: (this: unknown, ...args: unknown[]) => Promise<void> | void;
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

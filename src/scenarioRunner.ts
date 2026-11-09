import { resolveTimeout, runWithTimeout } from './timeout';
import { formatLocation, resolveLocation, stepTitle, type Position, type SourceLocation } from './gherkin';
import { ambiguousStepMessage, findStepDefinitions, undefinedStepsMessage } from './stepDefinitions';
import type { TestInfo, TestType } from '@playwright/test';
import type { Pickle, PickleStep } from '@cucumber/messages';
import type { Feature, HookDefinition, HookResult, StepDefinitionMatch, SupportCodeLibrary, WorldBase } from './types';

export type AnyTestType = TestType<Record<string, unknown>, Record<string, unknown>>;

export const HOOK_NAMES = {
    BEFORE_ALL: 'Before All',
    AFTER_ALL: 'After All',
    BEFORE: 'Before',
    AFTER: 'After',
    BEFORE_STEP: 'Before Step',
    AFTER_STEP: 'After Step'
} as const;

const TEST_CASE_ID = '0';
const TEST_STEP_ID = '0';
const DEFAULT_COLUMN = 1;

type ExecutionStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'undefined' | 'ambiguous';

interface ExecutionResult {
    status: ExecutionStatus;
    error?: Error;
    start: number;
}

type ErrorHandler = (err: unknown) => void;

/**
 * Error raised for undefined, ambiguous and pending steps
 */
class StepStatusError extends Error {
    constructor(
        message: string,
        readonly status: ExecutionStatus
    ) {
        super(message);
        this.name = 'StepStatusError';
    }
}

export function getLine(definition: Pick<HookDefinition, 'uri' | 'line'>): { location?: SourceLocation } {
    if (!definition.uri) return {};
    return { location: { file: definition.uri, line: definition.line, column: DEFAULT_COLUMN } };
}

/**
 * Invoke hook code applying `{ timeout }` option or default timeout
 */
export function invokeHook(
    hook: HookDefinition,
    thisArg: unknown,
    args: unknown[],
    hookName: string,
    defaultTimeout?: number
): Promise<unknown> {
    return runWithTimeout(
        () => hook.code.apply(thisArg, args),
        resolveTimeout(hook, defaultTimeout),
        `${hookName} hook timed out after {timeout} ms\n  at ${hook.uri}:${hook.line}`
    );
}

/**
 * After hooks run in reverse definition order, so cleanup mirrors setup (cucumber semantics)
 */
export function reversed<T>(hooks: readonly T[]): T[] {
    return [...hooks].reverse();
}

function createResult(): ExecutionResult {
    return { status: 'passed', start: Date.now() };
}

/**
 * Record the first non-passed status; later ones don't override it
 */
function setStatus(result: ExecutionResult, status: ExecutionStatus, error?: Error): void {
    if (result.status !== 'passed') return;
    result.status = status;
    result.error = error;
}

function toHookResult(result: ExecutionResult): HookResult {
    return {
        duration: Date.now() - result.start,
        message: result.error?.message,
        status: result.status.toUpperCase(),
        exception: result.error
    };
}

interface ResolvedStep {
    pickleStep: PickleStep;
    location?: SourceLocation;
    matches: StepDefinitionMatch[];
}

export interface ScenarioContext {
    /** `test` used to report steps and hooks */
    test: AnyTestType;
    supportCodeLibrary: SupportCodeLibrary;
    feature: Feature;
    positions: Map<string, Position>;
    testCase: Pickle;
    world: WorldBase;
    /** fail scenarios with pending steps */
    strict: boolean;
    stepLocation: 'definition' | 'feature';
    defaultTimeout?: number;
}

/**
 * Runs a single scenario with cucumber semantics:
 * - Before / BeforeStep hooks run in definition order, After / AfterStep hooks in reverse order
 * - Before hooks stop at the first failing or skipping hook
 * - steps after a failed, skipped or pending step (or Before hook) don't run and are reported as skipped
 * - an undefined step fails the scenario listing all undefined steps of the scenario with snippets
 * - all BeforeStep, AfterStep and After hooks run even if one of them fails
 * - AfterStep hooks run even if a BeforeStep hook fails, and receive the result of the step
 * - the first error is the one reported; errors of later hooks don't replace it
 */
export class ScenarioRunner {
    private readonly result = createResult();
    private readonly testInfo: TestInfo;
    private readonly steps: ResolvedStep[];

    constructor(private readonly ctx: ScenarioContext) {
        this.testInfo = ctx.world.test.info();
        this.steps = ctx.testCase.steps.map(pickleStep => ({
            pickleStep,
            location: resolveLocation(ctx.positions, ctx.feature.uri, pickleStep.astNodeIds),
            matches: findStepDefinitions(ctx.supportCodeLibrary, pickleStep.text)
        }));
    }

    async run(): Promise<void> {
        const { supportCodeLibrary, world } = this.ctx;
        let failure: { error: unknown } | undefined;
        const onError: ErrorHandler = err => {
            this.markError(err, this.result);
            failure ??= { error: err };
        };
        let nextStep = 0;

        try {
            const beforeStatus = await this.runHooks(
                supportCodeLibrary.beforeTestCaseHookDefinitions,
                HOOK_NAMES.BEFORE,
                () => this.caseHookParameter()
            );
            if (beforeStatus) setStatus(this.result, beforeStatus);

            while (nextStep < this.steps.length) {
                if (this.result.status === 'skipped' || this.result.status === 'pending') break;
                await this.runStep(nextStep++);
            }
        } catch (err) {
            onError(err);
        }
        await this.reportSkippedSteps(nextStep);

        this.markSoftErrors(0, this.result);
        await this.runHooks(
            reversed(supportCodeLibrary.afterTestCaseHookDefinitions),
            HOOK_NAMES.AFTER,
            () => ({ ...this.caseHookParameter(), result: toHookResult(this.result) }),
            onError
        );
        if (failure) throw failure.error;

        if (this.result.status === 'skipped') {
            world.test.skip(true, 'Scenario skipped by step or hook');
        }
        if (this.result.status === 'pending') {
            world.test.fixme(true, this.result.error?.message);
        }
    }

    private async runStep(index: number): Promise<void> {
        const { test, supportCodeLibrary } = this.ctx;
        const { pickleStep, location: stepLocation, matches } = this.steps[index];

        await test.step(
            stepTitle(pickleStep),
            async () => {
                // undefined or ambiguous: reported as a failed step pointing to the feature file
                if (matches.length !== 1) throw this.lookupError(index);
                const step = matches[0];
                const stepResult = createResult();
                let failure: { error: unknown } | undefined;
                const onError: ErrorHandler = err => {
                    this.markError(err, stepResult, this.result);
                    failure ??= { error: err };
                };

                await this.runHooks(
                    supportCodeLibrary.beforeTestStepHookDefinitions,
                    HOOK_NAMES.BEFORE_STEP,
                    () => this.stepHookParameter(pickleStep),
                    onError
                );
                if (!failure) {
                    await this.invokeStep(step, pickleStep, stepLocation, stepResult).catch(onError);
                }
                await this.runHooks(
                    reversed(supportCodeLibrary.afterTestStepHookDefinitions),
                    HOOK_NAMES.AFTER_STEP,
                    () => ({ ...this.stepHookParameter(pickleStep), result: toHookResult(stepResult) }),
                    onError
                );
                if (failure) throw failure.error;
            },
            this.reportedLocation(this.steps[index])
        );
    }

    /**
     * Show steps that didn't run in the report as skipped.
     * Only affects the report, so it never prevents After hooks from running.
     */
    private async reportSkippedSteps(from: number): Promise<void> {
        try {
            for (const resolved of this.steps.slice(from)) {
                await this.ctx.test.step.skip(
                    stepTitle(resolved.pickleStep),
                    () => {},
                    this.reportedLocation(resolved)
                );
            }
        } catch {
            // e.g. the test has already timed out
        }
    }

    private reportedLocation({ location, matches }: ResolvedStep): { location?: SourceLocation } {
        return matches.length === 1 && this.ctx.stepLocation === 'definition' ? getLine(matches[0]) : { location };
    }

    private lookupError(index: number): StepStatusError {
        const { pickleStep, location, matches } = this.steps[index];
        if (matches.length > 1) {
            return new StepStatusError(
                ambiguousStepMessage(pickleStep.text, matches, formatLocation(location)),
                'ambiguous'
            );
        }
        // list undefined steps of the rest of the scenario too, so they can be implemented at once
        const undefinedSteps = this.steps
            .slice(index)
            .filter(step => step.matches.length === 0)
            .map(step => ({ pickleStep: step.pickleStep, location: formatLocation(step.location) }));
        return new StepStatusError(undefinedStepsMessage(this.ctx.supportCodeLibrary, undefinedSteps), 'undefined');
    }

    private async invokeStep(
        step: StepDefinitionMatch,
        pickleStep: PickleStep,
        stepLocation: SourceLocation | undefined,
        stepResult: ExecutionResult
    ): Promise<void> {
        const { world, strict, defaultTimeout } = this.ctx;
        const softErrorsBefore = this.testInfo.errors.length;
        const { parameters } = await step.getInvocationParameters({
            step: { text: pickleStep.text, argument: pickleStep.argument },
            world
        });
        const returned = await runWithTimeout(
            () => step.code.apply(world, parameters),
            resolveTimeout(step, defaultTimeout),
            `Step '${pickleStep.text}' timed out after {timeout} ms\n  at ${step.uri}:${step.line}`
        );
        if (returned === 'skipped') {
            this.mark('skipped', undefined, stepResult, this.result);
        } else if (returned === 'pending') {
            const error = new StepStatusError(
                `Step '${pickleStep.text}' is pending\n  at ${formatLocation(stepLocation)}`,
                'pending'
            );
            this.mark('pending', error, stepResult, this.result);
            if (strict) throw error;
        }
        this.markSoftErrors(softErrorsBefore, stepResult, this.result);
    }

    /**
     * Execute hooks applicable to the test case.
     * Without `onError` (Before hooks) the first hook that fails or returns `'skipped'` stops execution,
     * and the error is thrown; with `onError` all hooks run and each failure is passed to it.
     * @returns `'skipped'` if any hook returned `'skipped'` (cucumber semantics)
     */
    private async runHooks(
        hooks: HookDefinition[],
        defaultHookName: string,
        createPayload: () => unknown,
        onError?: ErrorHandler
    ): Promise<ExecutionStatus | undefined> {
        const { test, testCase, world, defaultTimeout } = this.ctx;
        let status: ExecutionStatus | undefined;
        for (const hook of hooks) {
            if (!hook.appliesToTestCase(testCase)) continue;
            const hookName = hook.name ?? defaultHookName;
            try {
                const returned = await test.step(
                    hookName,
                    () => invokeHook(hook, world, [createPayload()], hookName, defaultTimeout),
                    getLine(hook)
                );
                if (returned === 'skipped') {
                    status = 'skipped';
                    if (!onError) break;
                }
            } catch (err) {
                if (!onError) throw err;
                onError(err);
            }
        }
        return status;
    }

    private mark(status: ExecutionStatus, error: Error | undefined, ...results: ExecutionResult[]): void {
        for (const result of results) setStatus(result, status, error);
    }

    private markError(err: unknown, ...results: ExecutionResult[]): void {
        // `test.skip()` called inside a step or hook throws, but the scenario is skipped rather than failed
        const status =
            this.testInfo.expectedStatus === 'skipped'
                ? 'skipped'
                : err instanceof StepStatusError
                  ? err.status
                  : 'failed';
        this.mark(status, err as Error, ...results);
    }

    /**
     * Soft assertions don't throw, but add errors to the test info
     * @param since - number of errors recorded before the checked code ran
     */
    private markSoftErrors(since: number, ...results: ExecutionResult[]): void {
        const softError = this.testInfo.errors[since];
        if (softError) this.mark('failed', new Error(softError.message ?? softError.value), ...results);
    }

    private caseHookParameter() {
        return {
            gherkinDocument: this.ctx.feature.gherkinDocument,
            pickle: this.ctx.testCase,
            testCaseStartedId: TEST_CASE_ID
        };
    }

    private stepHookParameter(pickleStep: PickleStep) {
        return {
            ...this.caseHookParameter(),
            testStepId: TEST_STEP_ID,
            pickleStep
        };
    }
}

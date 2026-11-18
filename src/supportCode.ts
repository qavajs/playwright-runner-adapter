import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CucumberExpression,
    type Expression,
    ParameterType,
    ParameterTypeRegistry,
    RegularExpression
} from '@cucumber/cucumber-expressions';
import { type GherkinDocument, type Pickle, type PickleStep, TestStepResultStatus } from '@cucumber/messages';
import { DataTable } from './dataTable';
import { parseTagExpression } from './filter';
import { parseStepArguments } from './gherkin';
import type { TestWorld } from './PlaywrightWorld';
import type {
    HookDefinition,
    HookResult,
    StepArgument,
    StepDefinitionMatch,
    SupportCodeLibrary,
    WorldBase,
    WorldOptions
} from './types';

/** Step result statuses, e.g. to check `result.status === Status.FAILED` in After hooks */
export const Status = TestStepResultStatus;

/** World type of step and hook definitions without an explicit `this` type */
export type IWorld<Parameters = any> = TestWorld<Parameters> & Record<string, any>;
export type IWorldOptions<Parameters = any> = WorldOptions<Parameters>;

export interface ITestCaseHookParameter {
    gherkinDocument: GherkinDocument;
    pickle: Pickle;
    /** result of the scenario, passed to After hooks */
    result?: HookResult;
    testCaseStartedId: string;
}

export interface ITestStepHookParameter {
    gherkinDocument: GherkinDocument;
    pickle: Pickle;
    pickleStep: PickleStep;
    /** result of the step, passed to AfterStep hooks */
    result: HookResult;
    testCaseStartedId: string;
    testStepId: string;
}

export type DefineStepPattern = string | RegExp;

export interface IDefineStepOptions {
    timeout?: number;
    /** passed to the function set with `setDefinitionFunctionWrapper` */
    wrapperOptions?: any;
}

export interface IDefineTestCaseHookOptions {
    name?: string;
    tags?: string;
    timeout?: number;
}

export interface IDefineTestStepHookOptions {
    tags?: string;
    timeout?: number;
}

export interface IDefineTestRunHookOptions {
    name?: string;
    timeout?: number;
}

export interface IParameterTypeDefinition<T> {
    name: string;
    regexp: readonly RegExp[] | readonly string[] | RegExp | string;
    transformer?: (this: any, ...match: string[]) => T | PromiseLike<T>;
    useForSnippets?: boolean;
    preferForRegexpMatch?: boolean;
}

export type TestStepFunction<World> = (this: World, ...args: any[]) => any;
export type TestCaseHookFunction<World> = (this: World, arg: ITestCaseHookParameter) => any;
export type TestStepHookFunction<World> = (this: World, arg: ITestStepHookParameter) => any;
export type TestRunHookFunction = (this: Record<string, never>) => any;

export interface IDefineStep {
    <World = IWorld>(pattern: DefineStepPattern, code: TestStepFunction<World>): void;
    <World = IWorld>(pattern: DefineStepPattern, options: IDefineStepOptions, code: TestStepFunction<World>): void;
}

export interface IDefineTestCaseHook {
    <World = IWorld>(code: TestCaseHookFunction<World>): void;
    <World = IWorld>(tags: string, code: TestCaseHookFunction<World>): void;
    <World = IWorld>(options: IDefineTestCaseHookOptions, code: TestCaseHookFunction<World>): void;
}

export interface IDefineTestStepHook {
    <World = IWorld>(code: TestStepHookFunction<World>): void;
    <World = IWorld>(tags: string, code: TestStepHookFunction<World>): void;
    <World = IWorld>(options: IDefineTestStepHookOptions, code: TestStepHookFunction<World>): void;
}

export interface IDefineTestRunHook {
    (code: TestRunHookFunction): void;
    (options: IDefineTestRunHookOptions, code: TestRunHookFunction): void;
}

export type DefinitionFunctionWrapper = (fn: (...args: any[]) => any, wrapperOptions?: any) => (...args: any[]) => any;

type Code = (this: unknown, ...args: unknown[]) => unknown;
type WorldConstructor = new (options: WorldOptions) => WorldBase;

interface DefinitionConfig {
    code: Code;
    options: Record<string, any>;
    uri: string;
    line: number;
}

interface StepDefinitionConfig extends DefinitionConfig {
    pattern: DefineStepPattern;
}

type HookKind =
    | 'beforeTestRun'
    | 'afterTestRun'
    | 'beforeTestCase'
    | 'afterTestCase'
    | 'beforeTestStep'
    | 'afterTestStep';

const HOOK_FUNCTION_NAMES: Record<HookKind, string> = {
    beforeTestRun: 'BeforeAll',
    afterTestRun: 'AfterAll',
    beforeTestCase: 'Before',
    afterTestCase: 'After',
    beforeTestStep: 'BeforeStep',
    afterTestStep: 'AfterStep'
};

/**
 * Compiled adapter files (`adapter` and `adapter/js` builds) and their sources (stack frames are source mapped),
 * skipped when locating definitions
 */
const ADAPTER_DIR = basename(__dirname) === 'js' ? dirname(__dirname) : __dirname;
const ADAPTER_DIRS = [ADAPTER_DIR + sep, join(dirname(ADAPTER_DIR), 'src') + sep];

function isAdapterFrame(file: string): boolean {
    return file.startsWith('node:') || ADAPTER_DIRS.some(dir => file.startsWith(dir));
}

/** `at fn (file:line:column)` or `at file:line:column` */
const STACK_FRAME = /^\s*at (?:.*? \()?(.+?):(\d+):\d+\)?$/;

/**
 * Location of the user code calling a definition function: first stack frame outside of the adapter.
 * The formatted stack is parsed (not call sites), so source maps of transpiled step files apply.
 */
function definitionLocation(cwd: string): { uri: string; line: number } {
    const originalLimit = Error.stackTraceLimit;
    let stack: string | undefined;
    try {
        Error.stackTraceLimit = 50;
        stack = new Error().stack;
    } finally {
        Error.stackTraceLimit = originalLimit;
    }
    for (const frame of stack?.split('\n') ?? []) {
        const match = STACK_FRAME.exec(frame);
        if (!match) continue;
        const file = match[1].startsWith('file://') ? fileURLToPath(match[1]) : match[1];
        if (isAdapterFrame(file)) continue;
        return { uri: relative(cwd, file), line: Number(match[2]) };
    }
    return { uri: 'unknown', line: 0 };
}

class StepDefinition implements StepDefinitionMatch {
    constructor(
        readonly pattern: DefineStepPattern,
        readonly expression: Expression,
        readonly code: Code,
        readonly unwrappedCode: Code,
        readonly options: IDefineStepOptions,
        readonly uri: string,
        readonly line: number
    ) {}

    matchesStepName(text: string): boolean {
        return this.expression.match(text) !== null;
    }

    async getInvocationParameters({
        step,
        world
    }: {
        step: { text: string; argument?: StepArgument };
        world: unknown;
    }): Promise<{ parameters: unknown[] }> {
        const args = this.expression.match(step.text) ?? [];
        const parameters: unknown[] = await Promise.all(args.map(arg => arg.getValue(world)));
        parameters.push(
            ...parseStepArguments<unknown>(step.argument, {
                dataTable: table => new DataTable(table),
                docString: docString => docString.content
            })
        );
        return { parameters };
    }
}

class HookDefinitionImpl implements HookDefinition {
    readonly name?: string;
    private readonly tagFilter?: { evaluate(tags: string[]): boolean };

    constructor(
        readonly code: Code,
        readonly unwrappedCode: Code,
        readonly options: { name?: string; tags?: string; timeout?: number },
        readonly uri: string,
        readonly line: number,
        hookName: string
    ) {
        this.name = options.name;
        const tags = options.tags?.trim();
        if (tags) this.tagFilter = parseTagExpression(tags, `${hookName} hook at ${uri}:${line}`);
    }

    appliesToTestCase(pickle: Pickle): boolean {
        return this.tagFilter?.evaluate(pickle.tags.map(tag => tag.name)) ?? true;
    }
}

function assertDefinition(fnName: string, location: DefinitionConfig, checks: [boolean, string][]): void {
    const failed = checks.filter(([valid]) => !valid).map(([, message]) => message);
    if (failed.length > 0) {
        throw new Error(`Invalid ${fnName} definition at ${location.uri}:${location.line}: ${failed.join('; ')}`);
    }
}

function isPlainOptions(options: unknown): boolean {
    return typeof options === 'object' && options !== null && !Array.isArray(options);
}

/**
 * Collects step definitions, hooks and parameter types while support code files are loaded,
 * and builds the support code library from them
 */
export class SupportCodeLibraryBuilder {
    private cwd = process.cwd();
    private stepDefinitionConfigs: StepDefinitionConfig[] = [];
    private hookConfigs: Record<HookKind, DefinitionConfig[]> = SupportCodeLibraryBuilder.emptyHooks();
    private parameterTypeRegistry = new ParameterTypeRegistry();
    private definitionFunctionWrapper?: DefinitionFunctionWrapper;
    private defaultTimeout?: number;
    private World?: WorldConstructor;

    private static emptyHooks(): Record<HookKind, DefinitionConfig[]> {
        return {
            beforeTestRun: [],
            afterTestRun: [],
            beforeTestCase: [],
            afterTestCase: [],
            beforeTestStep: [],
            afterTestStep: []
        };
    }

    /**
     * Forget all definitions, e.g. before loading support code files
     * @param cwd - definition locations are relative to it
     * @param World - default world constructor
     */
    reset(cwd: string, World?: new (options: any) => any): void {
        this.cwd = cwd;
        this.stepDefinitionConfigs = [];
        this.hookConfigs = SupportCodeLibraryBuilder.emptyHooks();
        this.parameterTypeRegistry = new ParameterTypeRegistry();
        this.definitionFunctionWrapper = undefined;
        this.defaultTimeout = undefined;
        this.World = World as WorldConstructor | undefined;
    }

    defineStep(pattern: DefineStepPattern, options: unknown, code?: unknown): void {
        if (typeof options === 'function') {
            code = options;
            options = {};
        }
        const config = { ...definitionLocation(this.cwd), pattern, options, code } as StepDefinitionConfig;
        assertDefinition('step', config, [
            [typeof pattern === 'string' || pattern instanceof RegExp, 'pattern must be a string or a RegExp'],
            [isPlainOptions(options), 'options must be an object'],
            [typeof code === 'function', 'code must be a function']
        ]);
        this.stepDefinitionConfigs.push(config);
    }

    defineHook(kind: HookKind, options: unknown, code?: unknown): void {
        if (typeof options === 'string') {
            options = { tags: options };
        } else if (typeof options === 'function') {
            code = options;
            options = {};
        }
        const config = { ...definitionLocation(this.cwd), options, code } as DefinitionConfig;
        assertDefinition(HOOK_FUNCTION_NAMES[kind], config, [
            [isPlainOptions(options), 'options must be an object or a tag expression'],
            [typeof code === 'function', 'code must be a function']
        ]);
        this.hookConfigs[kind].push(config);
    }

    defineParameterType({
        name,
        regexp,
        transformer,
        useForSnippets = true,
        preferForRegexpMatch = false
    }: IParameterTypeDefinition<unknown>): void {
        this.parameterTypeRegistry.defineParameterType(
            new ParameterType(
                name,
                regexp as RegExp | string | readonly RegExp[] | readonly string[],
                null,
                transformer,
                useForSnippets,
                preferForRegexpMatch
            )
        );
    }

    setDefaultTimeout(milliseconds: number): void {
        this.defaultTimeout = milliseconds;
    }

    setDefinitionFunctionWrapper(fn: DefinitionFunctionWrapper): void {
        this.definitionFunctionWrapper = fn;
    }

    setWorldConstructor(World: WorldConstructor): void {
        this.World = World;
    }

    /**
     * Apply the function set with `setDefinitionFunctionWrapper`, keeping the arity of the original code
     */
    private wrapCode(code: Code, wrapperOptions?: unknown): Code {
        if (!this.definitionFunctionWrapper) return code;
        const wrapped = this.definitionFunctionWrapper(code, wrapperOptions) as Code;
        if (wrapped === code) return code;
        const withArity = function (this: unknown, ...args: unknown[]) {
            return wrapped.apply(this, args);
        };
        Object.defineProperty(withArity, 'length', { value: code.length });
        return withArity;
    }

    private buildStepDefinitions(): StepDefinition[] {
        const undefinedParameterTypes: string[] = [];
        const stepDefinitions: StepDefinition[] = [];
        for (const { pattern, options, code, uri, line } of this.stepDefinitionConfigs) {
            let expression: Expression;
            try {
                expression =
                    typeof pattern === 'string'
                        ? new CucumberExpression(pattern, this.parameterTypeRegistry)
                        : new RegularExpression(pattern, this.parameterTypeRegistry);
            } catch (err) {
                const name = (err as { undefinedParameterTypeName?: string }).undefinedParameterTypeName;
                if (name === undefined) {
                    throw new Error(`Invalid step definition '${String(pattern)}' at ${uri}:${line}`, { cause: err });
                }
                undefinedParameterTypes.push(`  {${name}} in '${String(pattern)}' - ${uri}:${line}`);
                continue;
            }
            stepDefinitions.push(
                new StepDefinition(
                    pattern,
                    expression,
                    this.wrapCode(code, options.wrapperOptions),
                    code,
                    options,
                    uri,
                    line
                )
            );
        }
        if (undefinedParameterTypes.length > 0) {
            throw new Error(
                [
                    'Undefined parameter types used in step definitions (define them with defineParameterType):',
                    ...undefinedParameterTypes
                ].join('\n')
            );
        }
        return stepDefinitions;
    }

    private buildHooks(kind: HookKind): HookDefinition[] {
        return this.hookConfigs[kind].map(
            ({ code, options, uri, line }) =>
                new HookDefinitionImpl(this.wrapCode(code), code, options, uri, line, HOOK_FUNCTION_NAMES[kind])
        );
    }

    finalize(): SupportCodeLibrary {
        if (!this.World) throw new Error('World constructor is not set, call setWorldConstructor');
        return {
            World: this.World,
            stepDefinitions: this.buildStepDefinitions(),
            parameterTypeRegistry: this.parameterTypeRegistry,
            defaultTimeout: this.defaultTimeout,
            beforeTestRunHookDefinitions: this.buildHooks('beforeTestRun'),
            afterTestRunHookDefinitions: this.buildHooks('afterTestRun'),
            beforeTestCaseHookDefinitions: this.buildHooks('beforeTestCase'),
            afterTestCaseHookDefinitions: this.buildHooks('afterTestCase'),
            beforeTestStepHookDefinitions: this.buildHooks('beforeTestStep'),
            afterTestStepHookDefinitions: this.buildHooks('afterTestStep')
        };
    }
}

// one builder per process: the package is built twice (`adapter` and `adapter/js`),
// and definitions must be collected in one place whichever build a support code file imports
const BUILDER_KEY = Symbol.for('@qavajs/playwright-runner-adapter/supportCodeLibraryBuilder');
const registry = globalThis as { [BUILDER_KEY]?: SupportCodeLibraryBuilder };

registry[BUILDER_KEY] ??= new SupportCodeLibraryBuilder();
export const supportCodeLibraryBuilder: SupportCodeLibraryBuilder = registry[BUILDER_KEY];

const builder = () => supportCodeLibraryBuilder;

/** Define a step; `Given`, `When`, `Then` and `defineStep` are interchangeable */
export const defineStep: IDefineStep = (pattern: DefineStepPattern, options: unknown, code?: unknown) =>
    builder().defineStep(pattern, options, code);
export const Given: IDefineStep = defineStep;
export const When: IDefineStep = defineStep;
export const Then: IDefineStep = defineStep;

function hookFunction<T>(kind: HookKind): T {
    return ((options: unknown, code?: unknown) => builder().defineHook(kind, options, code)) as T;
}

/** Hook run before each scenario, in definition order */
export const Before = hookFunction<IDefineTestCaseHook>('beforeTestCase');
/** Hook run after each scenario, in reverse definition order */
export const After = hookFunction<IDefineTestCaseHook>('afterTestCase');
/** Hook run before each step, in definition order */
export const BeforeStep = hookFunction<IDefineTestStepHook>('beforeTestStep');
/** Hook run after each step, in reverse definition order */
export const AfterStep = hookFunction<IDefineTestStepHook>('afterTestStep');
/** Hook run once per worker before its scenarios */
export const BeforeAll = hookFunction<IDefineTestRunHook>('beforeTestRun');
/** Hook run once per worker after its scenarios */
export const AfterAll = hookFunction<IDefineTestRunHook>('afterTestRun');

/** Define a custom parameter type for Cucumber expressions */
export function defineParameterType<T>(options: IParameterTypeDefinition<T>): void {
    builder().defineParameterType(options as IParameterTypeDefinition<unknown>);
}

/**
 * Timeout of steps and hooks without their own `{ timeout }` option. There is no default:
 * without it only the Playwright test timeout applies. `-1` disables the timeout.
 */
export function setDefaultTimeout(milliseconds: number): void {
    builder().setDefaultTimeout(milliseconds);
}

/** Wrap code of every step and hook definition, e.g. to add logging */
export function setDefinitionFunctionWrapper(fn: DefinitionFunctionWrapper): void {
    builder().setDefinitionFunctionWrapper(fn);
}

/** Set the class used to create the world of each scenario */
export function setWorldConstructor(World: new (options: any) => any): void {
    builder().setWorldConstructor(World as WorldConstructor);
}

/**
 * Not supported: Playwright decides how scenarios run in parallel. Kept for compatibility, does nothing.
 * @deprecated use Playwright `fullyParallel`, `workers` and `test.describe.configure`
 */
export function setParallelCanAssign(_fn: (pickle: Pickle, runningPickles: Pickle[]) => boolean): void {}

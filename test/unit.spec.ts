import { test, expect } from '@playwright/test';
import { ParameterTypeRegistry } from '@cucumber/cucumber-expressions';
import { PickleStepType } from '@cucumber/messages';
import { tags, filter, resolveTestDetails, resolveRetries, parseTemplate, createTagFilter, DataTable } from '../adapter';
import { buildSnippet, stepTitle, toPickleArgument } from '../adapter/gherkin';
import { resolveTimeout, runWithTimeout } from '../adapter/timeout';
import { ScenarioRunner } from '../adapter/scenarioRunner';
import type { Feature, HookDefinition, StepDefinitionMatch, SupportCodeLibrary } from '../adapter/types';

test.describe('tags()', () => {
    test('matches single tag', () => {
        const regexp = tags('@foo');
        expect(regexp.test('@foo')).toBe(true);
        expect(regexp.test('@bar')).toBe(false);
    });

    test('handles and expression', () => {
        const regexp = tags('@foo and @bar');
        expect(regexp.test('@foo @bar')).toBe(true);
        expect(regexp.test('@foo')).toBe(false);
        expect(regexp.test('@bar')).toBe(false);
    });

    test('handles or expression', () => {
        const regexp = tags('@foo or @bar');
        expect(regexp.test('@foo')).toBe(true);
        expect(regexp.test('@bar')).toBe(true);
        expect(regexp.test('@baz')).toBe(false);
    });

    test('handles not expression', () => {
        const regexp = tags('not @noParallel');
        expect(regexp.test('@tag')).toBe(true);
        expect(regexp.test('@noParallel')).toBe(false);
    });

    test('handles complex expressions', () => {
        const regexp = tags('@a and (not @b or @c)');
        expect(regexp.test('@a @c')).toBe(true);
        expect(regexp.test('@a')).toBe(true);
        expect(regexp.test('@a @b')).toBe(false);
    });

    test('returns RegExp instance', () => {
        expect(tags('@foo')).toBeInstanceOf(RegExp);
    });

    test('reports invalid expression', () => {
        expect(() => tags('@foo or')).toThrow('Invalid tag expression in tags()');
        expect(() => tags('foo')).toThrow(`'foo' → '@foo'`);
    });
});

test.describe('filter()', () => {
    test('applies predicate to test name', () => {
        const regexp = filter(name => name.includes('login'));
        expect(regexp.test('user login scenario')).toBe(true);
        expect(regexp.test('register scenario')).toBe(false);
    });

    test('returns RegExp instance', () => {
        expect(filter(() => true)).toBeInstanceOf(RegExp);
    });

    test('passes exact name to predicate', () => {
        const captured: string[] = [];
        const regexp = filter(name => { captured.push(name); return true; });
        regexp.test('my test name');
        expect(captured).toContain('my test name');
    });

    test('always-true predicate matches anything', () => {
        const regexp = filter(() => true);
        expect(regexp.test('anything')).toBe(true);
        expect(regexp.test('')).toBe(true);
    });

    test('always-false predicate matches nothing', () => {
        const regexp = filter(() => false);
        expect(regexp.test('anything')).toBe(false);
    });
});

test.describe('resolveTestDetails()', () => {
    const pickle = (...tagNames: string[]) => ({
        id: '1', uri: 'a.feature', name: 'scenario', language: 'en', steps: [], astNodeIds: [],
        tags: tagNames.map(name => ({ name, astNodeId: '1' }))
    });

    test('keeps all tags and default annotations', () => {
        const details = resolveTestDetails(pickle('@a', '@a', '@b'));
        expect(details.tag).toEqual(['@a', '@b']);
        expect(details.annotation.map(a => a.type)).toEqual(['name', 'uri', 'tags']);
    });

    test('removes special tags from tags list', () => {
        const details = resolveTestDetails(pickle(
            '@a', '@lock(db)', '@annotation(issue,JIRA-1)', '@skip()', '@fixme(x)', '@fail()', '@slow()', '@skip'
        ));
        expect(details.tag).toEqual(['@a', '@skip']);
        expect(details.annotation[2]).toEqual({ type: 'tags', description: JSON.stringify(['@a', '@skip']) });
    });

    test('maps lock tags', () => {
        expect(resolveTestDetails(pickle('@lock(db)', '@lock(files)', '@lock(db)', '@lock(-exclusive-)')).lock)
            .toEqual(['db', 'files', '-exclusive-']);
        expect(resolveTestDetails(pickle('@lock()', '@lock', '@lock(db')).lock).toEqual([]);
    });

    test('maps annotation tags', () => {
        const details = resolveTestDetails(
            pickle('@annotation(issue,JIRA-1)', '@annotation(owner,team,qa)', '@annotation(flaky)', '@annotation()')
        );
        expect(details.annotation.slice(3)).toEqual([
            { type: 'issue', description: 'JIRA-1' },
            { type: 'owner', description: 'team,qa' },
            { type: 'flaky' }
        ]);
    });

    test('maps modifier tags to annotations', () => {
        const details = resolveTestDetails(pickle('@skip()', '@fixme(JIRA-1)', '@fail()', '@slow(heavy)'));
        expect(details.annotation.slice(3)).toEqual([
            { type: 'skip' },
            { type: 'fixme', description: 'JIRA-1' },
            { type: 'fail' },
            { type: 'slow', description: 'heavy' }
        ]);
    });

    test('maps timeout tag, the last one wins', () => {
        const details = resolveTestDetails(pickle('@timeout(1000)', '@a', '@timeout(5000)'));
        expect(details.timeout).toBe(5000);
        expect(details.tag).toEqual(['@a']);
        expect(resolveTestDetails(pickle('@timeout(abc)', '@timeout')).timeout).toBeUndefined();
    });

    test('consumes retries tag', () => {
        expect(resolveTestDetails(pickle('@retries(2)', '@a')).tag).toEqual(['@a']);
    });

    test('ignores plain modifier-like tags', () => {
        const details = resolveTestDetails(pickle('@skip', '@fixme', '@fail', '@slow', '@skipped()'));
        expect(details.annotation).toHaveLength(3);
    });
});

test.describe('stepTitle()', () => {
    test('returns plain text without argument', () => {
        expect(stepTitle({ text: 'simple step' })).toBe('simple step');
    });

    test('previews data table', () => {
        const argument = { dataTable: { rows: [{ cells: [{ value: 'a' }, { value: 'b' }] }, { cells: [{ value: '1' }, { value: '2' }] }] } };
        expect(stepTitle({ text: 'table', argument })).toBe('table [DataTable: | a | b | | 1 | 2 |]');
    });

    test('previews and truncates doc string', () => {
        expect(stepTitle({ text: 'doc', argument: { docString: { content: 'first\nsecond' } } }))
            .toBe('doc [MultiLine: first ↵ second]');
        const title = stepTitle({ text: 'doc', argument: { docString: { content: 'x'.repeat(100) } } });
        expect(title).toBe(`doc [MultiLine: ${'x'.repeat(49)}…]`);
    });
});

test.describe('parseTemplate()', () => {
    test('parses steps with data tables and doc strings', () => {
        expect(parseTemplate(`
            first step
              | a | b \\| c |
              | 1 | 2 |
            second step
              """
              line 1
                line 2
              """
            third step
        `)).toEqual([
            { text: 'first step', argument: [['a', 'b | c'], ['1', '2']] },
            { text: 'second step', argument: 'line 1\n  line 2' },
            { text: 'third step' }
        ]);
    });

    test('throws if argument does not follow a step', () => {
        expect(() => parseTemplate('| a |')).toThrow('must follow a step');
    });
});

test.describe('toPickleArgument()', () => {
    test('converts string to doc string', () => {
        expect(toPickleArgument('text')).toEqual({ argument: { docString: { content: 'text' } } });
    });

    test('converts arrays and DataTable to data table', () => {
        const expected = { argument: { dataTable: { rows: [{ cells: [{ value: '1' }] }] } } };
        expect(toPickleArgument([['1']])).toEqual(expected);
        expect(toPickleArgument(new DataTable([['1']]))).toEqual(expected);
    });

    test('passes other values as extra parameter', () => {
        const value = { key: 'value' };
        expect(toPickleArgument(value)).toEqual({ extra: value });
        expect(toPickleArgument(undefined)).toEqual({ extra: undefined });
    });
});

test.describe('createTagFilter()', () => {
    const pickle = (...tagNames: string[]) => ({
        id: '1', uri: 'a.feature', name: 'scenario', language: 'en', steps: [], astNodeIds: [],
        tags: tagNames.map(name => ({ name, astNodeId: '1' }))
    });

    test('matches everything without expressions', () => {
        expect(createTagFilter({ a: undefined, b: '' })(pickle())).toBe(true);
    });

    test('combines expressions with and', () => {
        const filter = createTagFilter({ config: 'not @wip', env: '@smoke' });
        expect(filter(pickle('@smoke'))).toBe(true);
        expect(filter(pickle('@smoke', '@wip'))).toBe(false);
        expect(filter(pickle('@regression'))).toBe(false);
    });

    test('names the source of an invalid expression', () => {
        expect(() => createTagFilter({ 'CUCUMBER_TAGS env variable': '@a and' }))
            .toThrow('Invalid tag expression in CUCUMBER_TAGS env variable: Tag expression "@a and" could not be parsed');
    });

    test('rejects tags without @', () => {
        expect(() => createTagFilter({ config: 'smoke and not (@wip or regression)' }))
            .toThrow(`Tags must start with '@': 'smoke' → '@smoke', 'regression' → '@regression'`);
        expect(() => createTagFilter({ config: '@lock\\(db\\) or not @a' })).not.toThrow();
    });

    test('evaluates real tags, not words of the title', () => {
        const filter = createTagFilter({ config: '@admin' });
        expect(filter({ ...pickle(), name: 'login as @admin' })).toBe(false);
    });
});

test.describe('buildSnippet()', () => {
    test('builds cucumber snippet for undefined step', () => {
        const snippet = buildSnippet(
            { parameterTypeRegistry: new ParameterTypeRegistry() },
            { id: '1', astNodeIds: [], text: 'I have 5 "apples"', type: PickleStepType.ACTION }
        );
        expect(snippet).toContain(`When('I have {int} {string}', async function (int, string) {`);
    });
});

test.describe('resolveRetries()', () => {
    test('reads retries from feature tags', () => {
        expect(resolveRetries([{ name: '@a' }, { name: '@retries(3)' }])).toBe(3);
        expect(resolveRetries([{ name: '@retries' }, { name: '@retries(x)' }])).toBeUndefined();
    });
});

test.describe('timeouts', () => {
    test('resolveTimeout() prefers definition option over default', () => {
        expect(resolveTimeout({ options: { timeout: 100 } }, 5000)).toBe(100);
        expect(resolveTimeout({ options: {} }, 5000)).toBe(5000);
        expect(resolveTimeout({}, undefined)).toBeUndefined();
        expect(resolveTimeout({ options: { timeout: -1 } }, 5000)).toBeUndefined();
    });

    test('runWithTimeout() rejects with message when code is too slow', async () => {
        await expect(runWithTimeout(() => new Promise(r => setTimeout(r, 200)), 20, 'slow after {timeout} ms'))
            .rejects.toThrow('slow after 20 ms');
        await expect(runWithTimeout(() => 'done', 20, '')).resolves.toBe('done');
        await expect(runWithTimeout(() => { throw new Error('sync'); }, undefined, '')).rejects.toThrow('sync');
    });
});

test.describe('ScenarioRunner', () => {
    type HookPayload = { result?: { status: string; duration: number; message?: string } };

    function createRunner(options: {
        /** step definitions */
        steps: Record<string, () => unknown>;
        /** step texts of the scenario, defaults to the step definitions */
        scenario?: string[];
        before?: HookDefinition[];
        after?: HookDefinition[];
        beforeStep?: HookDefinition[];
        afterStep?: HookDefinition[];
    }) {
        const testInfo = { errors: [] as { message?: string }[], expectedStatus: 'passed' };
        const skippedSteps: string[] = [];
        const step = Object.assign(async (_title: string, body: () => unknown) => body(), {
            skip: async (title: string) => { skippedSteps.push(title); }
        });
        const fakeTest = { step, info: () => testInfo, skip: () => {}, fixme: () => {} };
        const stepDefinitions: StepDefinitionMatch[] = Object.entries(options.steps).map(([text, code]) => ({
            line: 1,
            pattern: text,
            code,
            matchesStepName: (name: string) => name === text,
            getInvocationParameters: async () => ({ parameters: [] })
        }));
        const supportCodeLibrary = {
            stepDefinitions,
            parameterTypeRegistry: new ParameterTypeRegistry(),
            beforeTestRunHookDefinitions: [],
            afterTestRunHookDefinitions: [],
            beforeTestCaseHookDefinitions: options.before ?? [],
            afterTestCaseHookDefinitions: options.after ?? [],
            beforeTestStepHookDefinitions: options.beforeStep ?? [],
            afterTestStepHookDefinitions: options.afterStep ?? []
        } as unknown as SupportCodeLibrary;
        const testCase = {
            id: '1',
            uri: 'test.feature',
            name: 'scenario',
            language: 'en',
            astNodeIds: [],
            tags: [],
            steps: (options.scenario ?? Object.keys(options.steps))
                .map((text, i) => ({ id: String(i), text, astNodeIds: [], type: PickleStepType.ACTION }))
        };
        const feature = { uri: 'test.feature', gherkinDocument: { comments: [] }, tests: [testCase] } as unknown as Feature;
        const runner = new ScenarioRunner({
            test: fakeTest as any,
            supportCodeLibrary,
            feature,
            positions: new Map(),
            testCase,
            world: { test: fakeTest as any, init: () => {} },
            strict: true,
            stepLocation: 'definition'
        });
        return { runner, testInfo, skippedSteps };
    }

    function hook(code: (payload: HookPayload) => unknown): HookDefinition {
        return { line: 1, code: code as HookDefinition['code'], appliesToTestCase: () => true };
    }

    test('runs all After hooks when one of them fails', async () => {
        const results: string[] = [];
        const { runner } = createRunner({
            steps: { 'passing step': () => {} },
            // After hooks run in reverse definition order, so the failing one runs first
            after: [
                hook(payload => { results.push(payload.result!.status); }),
                hook(() => { throw new Error('first after hook'); })
            ]
        });
        await expect(runner.run()).rejects.toThrow('first after hook');
        expect(results).toEqual(['FAILED']);
    });

    test('runs Before hooks in definition order and After hooks in reverse order', async () => {
        const calls: string[] = [];
        const record = (name: string) => hook(() => { calls.push(name); });
        const { runner } = createRunner({
            steps: { 'some step': () => { calls.push('step'); } },
            before: [record('before 1'), record('before 2')],
            beforeStep: [record('before step 1'), record('before step 2')],
            afterStep: [record('after step 1'), record('after step 2')],
            after: [record('after 1'), record('after 2')]
        });
        await runner.run();
        expect(calls).toEqual([
            'before 1',
            'before 2',
            'before step 1',
            'before step 2',
            'step',
            'after step 2',
            'after step 1',
            'after 2',
            'after 1'
        ]);
    });

    test('reports scenario error rather than a later After hook error', async () => {
        const messages: (string | undefined)[] = [];
        const { runner } = createRunner({
            steps: { 'failing step': () => { throw new Error('step error'); } },
            after: [
                hook(payload => { messages.push(payload.result!.message); throw new Error('after hook error'); }),
                hook(payload => { messages.push(payload.result!.message); })
            ]
        });
        await expect(runner.run()).rejects.toThrow('step error');
        expect(messages).toEqual(['step error', 'step error']);
    });

    test('AfterStep hook receives result of its step', async () => {
        const results: { status: string; duration: number }[] = [];
        const { runner, testInfo } = createRunner({
            steps: {
                'slow step': () => new Promise(resolve => setTimeout(resolve, 100)),
                'soft failing step': () => { testInfo.errors.push({ message: 'soft error' }); },
                'fast step': () => {}
            },
            afterStep: [hook(payload => { results.push(payload.result!); })]
        });
        await runner.run();
        expect(results.map(result => result.status)).toEqual(['PASSED', 'FAILED', 'PASSED']);
        expect(results[0].duration).toBeGreaterThanOrEqual(90);
        expect(results[2].duration).toBeLessThan(50);
    });

    test('runs all BeforeStep and AfterStep hooks but not the step when BeforeStep hook fails', async () => {
        const calls: string[] = [];
        const { runner } = createRunner({
            steps: { 'some step': () => { calls.push('step'); } },
            beforeStep: [
                hook(() => { calls.push('before step 1'); throw new Error('before step error'); }),
                hook(() => { calls.push('before step 2'); })
            ],
            afterStep: [hook(payload => { calls.push(`after step ${payload.result!.status}`); })]
        });
        await expect(runner.run()).rejects.toThrow('before step error');
        expect(calls).toEqual(['before step 1', 'before step 2', 'after step FAILED']);
    });

    test('Before hook failure stops remaining Before hooks and steps, After hooks still run', async () => {
        const calls: string[] = [];
        const { runner, skippedSteps } = createRunner({
            steps: { 'some step': () => { calls.push('step'); } },
            before: [
                hook(() => { throw new Error('before error'); }),
                hook(() => { calls.push('before 2'); })
            ],
            after: [hook(payload => { calls.push(`after ${payload.result!.status}`); })]
        });
        await expect(runner.run()).rejects.toThrow('before error');
        expect(calls).toEqual(['after FAILED']);
        expect(skippedSteps).toEqual(['some step']);
    });

    test('Before hook returning skipped stops remaining Before hooks and skips the scenario', async () => {
        const calls: string[] = [];
        const { runner, skippedSteps } = createRunner({
            steps: { 'some step': () => { calls.push('step'); } },
            before: [
                hook(() => 'skipped'),
                hook(() => { calls.push('before 2'); })
            ],
            after: [hook(payload => { calls.push(`after ${payload.result!.status}`); })]
        });
        await runner.run();
        expect(calls).toEqual(['after SKIPPED']);
        expect(skippedSteps).toEqual(['some step']);
    });

    test('reports steps after a failed step as skipped', async () => {
        const { runner, skippedSteps } = createRunner({
            steps: {
                'first step': () => {},
                'failing step': () => { throw new Error('step error'); },
                'third step': () => {},
                'fourth step': () => {}
            }
        });
        await expect(runner.run()).rejects.toThrow('step error');
        expect(skippedSteps).toEqual(['third step', 'fourth step']);
    });

    test('undefined step error lists all undefined steps of the scenario with snippets', async () => {
        const { runner, skippedSteps } = createRunner({
            steps: { 'defined step': () => {} },
            scenario: ['first undefined step', 'defined step', 'I have 5 apples']
        });
        const error = await runner.run().catch((err: Error) => err);
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain(`Step 'first undefined step' is not defined`);
        expect(message).toContain(`Step 'I have 5 apples' is not defined`);
        expect(message).toContain('Implement them with the following snippets:');
        expect(message).toContain(`When('first undefined step'`);
        expect(message).toContain(`When('I have {int} apples'`);
        expect(skippedSteps).toEqual(['defined step', 'I have 5 apples']);
    });
});

import { test, expect } from '@playwright/test';
import { ParameterTypeRegistry } from '@cucumber/cucumber-expressions';
import { PickleStepType } from '@cucumber/messages';
import { tags, filter, resolveTestDetails, resolveRetries, parseTemplate, createTagFilter, DataTable } from '../adapter';
import { buildSnippet, stepTitle, toPickleArgument } from '../adapter/gherkin';
import { resolveTimeout, runWithTimeout } from '../adapter/timeout';

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

import { test, expect } from '@playwright/test';
import { tags, filter, resolveTestDetails } from '../adapter';

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

    test('ignores plain modifier-like tags', () => {
        const details = resolveTestDetails(pickle('@skip', '@fixme', '@fail', '@slow', '@skipped()'));
        expect(details.annotation).toHaveLength(3);
    });
});

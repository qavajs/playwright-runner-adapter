import { test, expect } from '@playwright/test';
import { tags, filter } from '../adapter';

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

import { wrapPromiseWithTimeout } from '@cucumber/cucumber';

interface DefinitionWithTimeout {
    options?: { timeout?: number };
}

/**
 * Resolve timeout of a step or hook definition:
 * `{ timeout }` option of the definition, otherwise value set by `setDefaultTimeout`.
 * Returns `undefined` when no timeout applies (not set, or disabled with `-1`/`0`);
 * the Playwright test timeout still applies in that case.
 */
export function resolveTimeout(definition: DefinitionWithTimeout, defaultTimeout?: number): number | undefined {
    const timeout = definition.options?.timeout ?? defaultTimeout;
    return timeout === undefined || timeout <= 0 ? undefined : timeout;
}

/**
 * Run definition code, failing with `message` if it does not complete within `timeout` milliseconds
 */
export function runWithTimeout<T>(code: () => T | Promise<T>, timeout: number | undefined, message: string): Promise<T> {
    const promise = Promise.resolve().then(code);
    if (timeout === undefined) return promise;
    return wrapPromiseWithTimeout(promise, timeout, message.replace('{timeout}', String(timeout)));
}

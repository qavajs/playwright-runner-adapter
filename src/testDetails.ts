import type { Pickle } from '@cucumber/messages';
import type { TestDetailsAnnotation } from '@playwright/test';

export interface ResolvedTestDetails {
    tag: string[];
    annotation: TestDetailsAnnotation[];
    lock: string[];
}

const LOCK_TAG = /^@lock\(([^)]+)\)$/;
const ANNOTATION_TAG = /^@annotation\(([^,)]+)(?:,(.*))?\)$/;
/**
 * Playwright applies annotations of these types as test modifiers
 * (skip/fixme before fixtures are set up, fail/slow at test start).
 */
const MODIFIER_TAG = /^@(skip|fixme|fail|slow)\((.*)\)$/;

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function createAnnotation(type: string, description?: string): TestDetailsAnnotation {
    const trimmed = description?.trim();
    return trimmed ? { type, description: trimmed } : { type };
}

/**
 * Translate gherkin tags of a pickle into playwright test details.
 *
 * - special tags below are consumed and not passed as playwright `tag`; all other tags are kept
 * - `@lock(name)` → `lock: 'name'`; `@lock(-exclusive-)` → built-in exclusive lock
 * - `@annotation(type,description)` → `annotation: { type, description }`
 * - `@skip()` / `@fixme()` / `@fail()` / `@slow()` → playwright modifier with optional description, e.g. `@fixme(JIRA-1)`
 *
 * Note: gherkin tags may not contain whitespace, so write `@annotation(issue,JIRA-1)` without spaces.
 */
export function resolveTestDetails(pickle: Pickle): ResolvedTestDetails {
    const tag: string[] = [];
    const extraAnnotation: TestDetailsAnnotation[] = [];
    const lock: string[] = [];

    for (const name of unique(pickle.tags.map(item => item.name))) {
        const lockMatch = LOCK_TAG.exec(name);
        if (lockMatch) {
            lock.push(lockMatch[1].trim());
            continue;
        }
        const annotationMatch = ANNOTATION_TAG.exec(name) ?? MODIFIER_TAG.exec(name);
        if (annotationMatch) {
            extraAnnotation.push(createAnnotation(annotationMatch[1].trim(), annotationMatch[2]));
            continue;
        }
        tag.push(name);
    }

    const annotation: TestDetailsAnnotation[] = [
        { type: 'name', description: pickle.name },
        { type: 'uri', description: pickle.uri },
        { type: 'tags', description: JSON.stringify(tag) },
        ...extraAnnotation
    ];

    return { tag, annotation, lock: unique(lock) };
}

import { globSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import type { Pickle } from '@cucumber/messages';
import type { Feature } from './types';

export const uuidFn = () => randomUUID();

/**
 * Make pickle names unique within a feature file: duplicates get a counter suffix (`name 2`, `name 3`)
 */
function duplicates(tests: readonly Pickle[]) {
    const counts: Record<string, number> = {};
    return tests.map(item => {
        const name = item.name;
        if (!(name in counts)) {
            counts[name] = 1;
        }
        if (counts[name] > 1) {
            item.name = `${item.name} ${counts[name]}`;
        }
        counts[name] = counts[name] + 1;
        return item;
    });
}

/**
 * Find files matching glob patterns; returns unique absolute paths in stable (sorted) order
 */
export function findFiles(patterns: string[]): string[] {
    if (patterns.length === 0) return [];
    const files = globSync(patterns).map(file => resolve(file));
    return [...new Set(files)].sort();
}

/**
 * Parse a feature file and compile its pickles.
 * Pickle names are made unique within the file, so `uri` + pickle name identifies a scenario.
 */
export function parseFeature(filePath: string): Feature {
    const parser = new Parser(new AstBuilder(uuidFn), new GherkinClassicTokenMatcher());
    const gherkinDocument = parser.parse(readFileSync(filePath, 'utf-8'));
    return {
        feature: gherkinDocument.feature?.name,
        uri: filePath,
        gherkinDocument,
        tests: duplicates(compile(gherkinDocument, relative(process.cwd(), filePath), uuidFn))
    };
}

export function loadFeatures(globPattern: string[]): Feature[] {
    return findFiles(globPattern).map(parseFeature);
}

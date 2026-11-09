import { globSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { supportCodeLibraryBuilder } from '@cucumber/cucumber';
import type { Pickle } from '@cucumber/messages';
import { PlaywrightWorld } from './PlaywrightWorld';
import type { CucumberAdapterConfig, Feature, SupportCodeLibrary } from './types';

const uuidFn = () => randomUUID();
const builder = new AstBuilder(uuidFn);
const matcher = new GherkinClassicTokenMatcher();
const parser = new Parser(builder, matcher);

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

export function loadFeatures(globPattern: string[]): Feature[] {
    const files = findFiles(globPattern);
    return files.map(filePath => {
        const gherkinDocument = parser.parse(readFileSync(filePath, 'utf-8'));
        return {
            feature: gherkinDocument.feature?.name,
            uri: filePath,
            gherkinDocument,
            tests: duplicates(compile(gherkinDocument, relative(process.cwd(), filePath), uuidFn))
        };
    });
}

/**
 * Require modules by name or path resolved from the current working directory (e.g. `ts-node/register`)
 */
export function loadModules(modules: string[]): void {
    const cwdRequire = createRequire(join(process.cwd(), 'index.js'));
    for (const name of modules) {
        cwdRequire(name);
    }
}

export function loadStepDefinitions(globPattern: string[], requireModules: string[] = []): SupportCodeLibrary {
    supportCodeLibraryBuilder.reset(process.cwd(), uuidFn);
    // cucumber defaults to 5000ms; apply a default timeout only when set explicitly with setDefaultTimeout
    (supportCodeLibraryBuilder as unknown as { defaultTimeout?: number }).defaultTimeout = undefined;
    supportCodeLibraryBuilder.methods.setWorldConstructor(PlaywrightWorld);
    loadModules(requireModules);
    for (const filePath of findFiles(globPattern)) {
        require(filePath);
    }
    return supportCodeLibraryBuilder.finalize() as unknown as SupportCodeLibrary;
}

export function load(config: CucumberAdapterConfig): { features: Feature[]; supportCodeLibrary: SupportCodeLibrary } {
    const envPaths = process.env.CUCUMBER_PATHS?.split(',')
        .map(path => path.trim())
        .filter(Boolean);
    const features = loadFeatures(envPaths?.length ? envPaths : config.paths);
    const supportCodeLibrary = loadStepDefinitions(
        [...(config.require ?? []), ...(config.import ?? [])],
        config.requireModules ?? []
    );
    return { features, supportCodeLibrary };
}

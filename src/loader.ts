import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { supportCodeLibraryBuilder } from '@cucumber/cucumber';
import type { Pickle, GherkinDocument } from '@cucumber/messages';
import { globSync } from 'glob';
import { PlaywrightWorld } from './PlaywrightWorld';

const uuidFn = () => randomUUID();
const builder = new AstBuilder(uuidFn);
const matcher = new GherkinClassicTokenMatcher();
const parser = new Parser(builder, matcher)

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

type Feature = {
    feature?: string;
    gherkinDocument: GherkinDocument;
    tests: readonly Pickle[];
}

export function loadFeatures(globPattern: string[]): Feature[] {
    const files = globSync(globPattern);
    return files.map(file => {
        const filePath = resolve(file);
        const gherkinDocument = parser.parse(readFileSync(filePath, 'utf-8'));
        return {
            feature: gherkinDocument.feature?.name,
            gherkinDocument,
            tests: duplicates(compile(gherkinDocument, file, uuidFn))
        }
    });
}

export function loadStepDefinitions(globPattern: string[]) {
    supportCodeLibraryBuilder.reset(process.cwd(), uuidFn);
    supportCodeLibraryBuilder.methods.setWorldConstructor(PlaywrightWorld);
    const files = globSync(globPattern);
    for (const file of files) {
        const filePath = resolve(file);
        require(filePath);
    }
    return supportCodeLibraryBuilder.finalize();
}

export function load(config: any) {
    const features = loadFeatures(config.paths);
    const supportCodeLibrary = loadStepDefinitions([
        ...(config.requireModules ?? []),
        ...(config.require ?? []),
        ...(config.import ?? [])
    ]);
    return { features, supportCodeLibrary }
}

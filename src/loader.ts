import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { supportCodeLibraryBuilder } from '@cucumber/cucumber';
import { globSync } from 'glob';
import { PlaywrightWorld } from './PlaywrightWorld';

const uuidFn = () => randomUUID();
const builder = new AstBuilder(uuidFn)
const matcher = new GherkinClassicTokenMatcher();
const parser = new Parser(builder, matcher)

function duplicates(tests: any[]) {
    const counts: Record<string, number> = {};
    return tests.map(item => {
        const name = item.name;
        if (!counts[name]) {
            counts[name] = 0;
        }
        if (counts[name]) {
            item.name = `${item.name} #${counts[item.name] + 1}`;
        }
        counts[item.name]++;
        return item;
    })
}

export function loadFeatures(globPattern: string[]) {
    const files = globSync(globPattern);
    return files.map(file => {
        const filePath = resolve(file);
        const gherkinDocument = parser.parse(readFileSync(filePath, 'utf-8'));
        return {
            feature: gherkinDocument.feature?.name,
            tests: duplicates(compile(gherkinDocument, file, uuidFn) as any)
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

export function load() {
    const config = require(join(process.cwd(), process.env.CONFIG ?? 'config.js'));
    const profile = process.env.PROFILE ?? 'default';

    const resolvedConfig = config[profile];
    const features = loadFeatures(resolvedConfig.paths);
    const supportCodeLibrary = loadStepDefinitions([
        ...(resolvedConfig.requireModules ?? []),
        ...(resolvedConfig.require ?? []),
        ...(resolvedConfig.import ?? [])
    ]);
    return { features, supportCodeLibrary }
}

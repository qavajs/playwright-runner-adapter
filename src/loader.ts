import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { supportCodeLibraryBuilder } from '@cucumber/cucumber';
import { globSync } from 'glob';
import {PlaywrightWorld} from './PlaywrightWorld';

const uuidFn = IdGenerator.uuid()
const builder = new AstBuilder(uuidFn)
const matcher = new GherkinClassicTokenMatcher();
const parser = new Parser(builder, matcher)

export function loadFeatures(globPattern: string[]) {
    const files = globSync(globPattern);
    return files.map(file => {
        const filePath = resolve(file);
        const gherkinDocument = parser.parse(readFileSync(filePath, 'utf-8'));
        return {
            feature: gherkinDocument.feature?.name,
            tests: compile(gherkinDocument, file, uuidFn)
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

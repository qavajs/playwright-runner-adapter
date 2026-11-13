import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { parseFeature } from './features';
import { buildFeatureJson, type JsonFeature, type ScenarioReport } from './cucumberJson';

export type { JsonFeature, JsonScenario, JsonStep } from './cucumberJson';

export interface CucumberJsonReporterOptions {
    /**
     * Path of the report file, resolved relative to the Playwright config directory
     * (default `cucumber-report.json`)
     */
    outputFile?: string;
}

const DEFAULT_OUTPUT_FILE = 'cucumber-report.json';

function annotation(test: TestCase, type: string): string | undefined {
    return test.annotations.find(item => item.type === type)?.description;
}

/**
 * Playwright reporter writing results of cucumber scenarios in Cucumber JSON format
 * (the format of cucumber-js `--format json`). Tests that are not cucumber scenarios are ignored.
 * Each Playwright project gets its own feature entries; the last attempt of a retried scenario is reported.
 * @example
 * // playwright.config.ts
 * export default defineConfig({
 *     reporter: [['@qavajs/playwright-runner-adapter/reporter', { outputFile: 'report/cucumber.json' }]]
 * });
 */
export default class CucumberJsonReporter implements Reporter {
    private outputFile = '';
    private readonly scenarios = new Map<string, ScenarioReport>();

    constructor(private readonly options: CucumberJsonReporterOptions = {}) {}

    onBegin(config: FullConfig): void {
        const configDir = config.configFile ? dirname(config.configFile) : process.cwd();
        this.outputFile = resolve(configDir, this.options.outputFile ?? DEFAULT_OUTPUT_FILE);
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        const uri = annotation(test, 'uri');
        const name = annotation(test, 'name');
        if (uri === undefined || name === undefined) return;
        this.scenarios.set(test.id, {
            project: test.parent.project()?.name ?? '',
            uri,
            name,
            status: result.status,
            error: result.error,
            annotations: [...test.annotations, ...result.annotations],
            steps: result.steps
        });
    }

    onEnd(): void {
        const groups = new Map<string, { project: string; uri: string; scenarios: ScenarioReport[] }>();
        for (const scenario of this.scenarios.values()) {
            const key = JSON.stringify([scenario.project, scenario.uri]);
            const group = groups.get(key) ?? { project: scenario.project, uri: scenario.uri, scenarios: [] };
            group.scenarios.push(scenario);
            groups.set(key, group);
        }
        const features: JsonFeature[] = [];
        const sortedGroups = [...groups.values()].sort(
            (a, b) => a.uri.localeCompare(b.uri) || a.project.localeCompare(b.project)
        );
        for (const { uri, scenarios } of sortedGroups) {
            try {
                features.push(buildFeatureJson(parseFeature(resolve(process.cwd(), uri)), uri, scenarios));
            } catch (err) {
                console.error(`Cucumber JSON reporter: can't report ${uri}: ${(err as Error).message}`);
            }
        }
        mkdirSync(dirname(this.outputFile), { recursive: true });
        writeFileSync(this.outputFile, JSON.stringify(features, null, 2));
    }

    printsToStdio(): boolean {
        return false;
    }
}

import { relative } from 'node:path';
import { Readable } from 'node:stream';
import { inspect } from 'node:util';
import { parseTagExpression } from './filter';
import { load } from './loader';
import { resolveRetries, resolveTestDetails } from './testDetails';
import { callAt, collectPositions, featureTitle, resolveLocation } from './gherkin';
import { getLine, HOOK_NAMES, invokeHook, reversed, ScenarioRunner, type AnyTestType } from './scenarioRunner';
import type { TestInfo } from '@playwright/test';
import type { Pickle } from '@cucumber/messages';
import type {
    AttachData,
    AttachOptions,
    CucumberAdapterConfig,
    Feature,
    HookDefinition,
    WorldBase,
    WorldOptions
} from './types';

const DEFAULT_VALUES = {
    ATTACHMENT_FILENAME: 'attachment',
    LOG_ATTACHMENT_NAME: 'log',
    TEXT_CONTENT_TYPE: 'text/plain',
    BINARY_CONTENT_TYPE: 'application/octet-stream'
} as const;

const BASE64_SUFFIX = ';base64';

/**
 * Log data to the report as `log` attachment of the current step (same as cucumber `this.log`)
 */
function log(this: { test: { info: () => TestInfo } }, data: unknown): void {
    const body = typeof data === 'string' ? data : inspect(data);
    this.test
        .info()
        .attach(DEFAULT_VALUES.LOG_ATTACHMENT_NAME, { body, contentType: DEFAULT_VALUES.TEXT_CONTENT_TYPE })
        .catch(() => console.log(body));
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/**
 * Attach data to the report. Compatible with cucumber `this.attach`:
 * - `attach(data, 'image/png')` or `attach(data, { mediaType, fileName })`
 * - `attach(base64String, 'image/png;base64')` decodes base64 data
 * - readable streams are buffered
 */
async function attach(
    this: { test: { info: () => TestInfo } },
    data: AttachData,
    mediaTypeOrOptions?: string | AttachOptions
): Promise<void> {
    const options: AttachOptions =
        typeof mediaTypeOrOptions === 'string' ? { mediaType: mediaTypeOrOptions } : (mediaTypeOrOptions ?? {});
    let body: string | Buffer = data instanceof Readable ? await streamToBuffer(data) : data;
    let contentType = options.mediaType;
    if (contentType?.endsWith(BASE64_SUFFIX)) {
        contentType = contentType.slice(0, -BASE64_SUFFIX.length);
        if (typeof body === 'string') body = Buffer.from(body, 'base64');
    }
    contentType ??= typeof body === 'string' ? DEFAULT_VALUES.TEXT_CONTENT_TYPE : DEFAULT_VALUES.BINARY_CONTENT_TYPE;
    const fileName = options.fileName ?? DEFAULT_VALUES.ATTACHMENT_FILENAME;
    return this.test.info().attach(fileName, { body, contentType });
}

/**
 * Register BeforeAll / AfterAll hooks; they run once per worker, in the order given
 */
function registerRunHooks(
    test: AnyTestType,
    kind: 'beforeAll' | 'afterAll',
    hooks: HookDefinition[],
    hookName: string,
    defaultTimeout?: number
): void {
    if (hooks.length === 0) return;
    test[kind](async () => {
        for (const hook of hooks) {
            await test.step(hookName, () => invokeHook(hook, {}, [], hookName, defaultTimeout), getLine(hook));
        }
    });
}

/**
 * Create scenario filter from tag expressions keyed by their source (used in error messages),
 * e.g. `{ 'tags option': config.tags, 'CUCUMBER_TAGS env variable': process.env.CUCUMBER_TAGS }`.
 * All expressions must match.
 */
export function createTagFilter(sources: Record<string, string | undefined>): (pickle: Pickle) => boolean {
    const nodes = Object.entries(sources)
        .map(([source, expression]) => [source, expression?.trim()] as const)
        .filter((entry): entry is readonly [string, string] => !!entry[1])
        .map(([source, expression]) => parseTagExpression(expression, source));
    return pickle => {
        const tagNames = pickle.tags.map(tag => tag.name);
        return nodes.every(node => node.evaluate(tagNames));
    };
}

/**
 * `@retries(n)` is applied with `test.describe.configure`, which works per feature only
 */
function assertRetriesOnFeatureOnly(feature: Feature, featureTags: readonly { name: string }[]): void {
    const featureTagNames = new Set(featureTags.map(tag => tag.name));
    for (const testCase of feature.tests) {
        const misplaced = testCase.tags.find(tag => tag.name.startsWith('@retries(') && !featureTagNames.has(tag.name));
        if (misplaced) {
            throw new Error(
                `${misplaced.name} is supported only on Feature, found on '${testCase.name}' in ${feature.uri}`
            );
        }
    }
}

/**
 * Make feature titles unique, so scenarios from features with the same name do not clash
 */
function uniqueFeatureTitles(features: Feature[]): string[] {
    const titles = features.map(feature => featureTitle(feature.feature, relative(process.cwd(), feature.uri)));
    return titles.map((title, index) =>
        titles.indexOf(title) === index ? title : `${title} (${relative(process.cwd(), features[index].uri)})`
    );
}

export function defineConfig(config: CucumberAdapterConfig): void {
    const { features, supportCodeLibrary } = load(config);
    const strict = config.strict ?? true;
    const stepLocation = config.stepLocation ?? 'definition';
    const defaultTimeout = supportCodeLibrary.defaultTimeout;
    const tagFilter = createTagFilter({
        '`tags` config option': config.tags,
        'CUCUMBER_TAGS env variable': process.env.CUCUMBER_TAGS
    });
    const worldOptions: WorldOptions = {
        log,
        attach,
        supportCodeLibrary,
        config,
        parameters: config.worldParameters ?? {}
    };

    // The world is created once at load time to read its `test` instance and the fixtures `init` requests.
    // Scenarios get their own world instance.
    const prototypeWorld = new supportCodeLibrary.World(worldOptions) as WorldBase;
    const test = prototypeWorld.test as AnyTestType;
    const fixturesSignature = prototypeWorld.init.toString();

    registerRunHooks(
        test,
        'beforeAll',
        supportCodeLibrary.beforeTestRunHookDefinitions,
        HOOK_NAMES.BEFORE_ALL,
        defaultTimeout
    );

    const titles = uniqueFeatureTitles(features);
    features.forEach((feature, featureIndex) => {
        const tests = feature.tests.filter(tagFilter);
        if (tests.length === 0) return;
        const positions = collectPositions(feature.gherkinDocument);
        const featureNode = feature.gherkinDocument.feature;
        const featureTags = featureNode?.tags ?? [];
        const retries = resolveRetries(featureTags);
        assertRetriesOnFeatureOnly(feature, featureTags);
        const featureLocation = featureNode
            ? { file: feature.uri, ...featureNode.location, column: featureNode.location.column ?? 1 }
            : undefined;

        callAt(featureLocation, test.describe, [
            titles[featureIndex],
            () => {
                if (retries !== undefined) test.describe.configure({ retries });

                for (const testCase of tests) {
                    const { tag, annotation, lock, timeout } = resolveTestDetails(testCase);
                    const testBody = async (fixtures: Record<string, unknown>) => {
                        const world = new supportCodeLibrary.World(worldOptions);
                        world.init(fixtures);
                        if (timeout !== undefined) world.test.info().setTimeout(timeout);
                        await new ScenarioRunner({
                            test,
                            supportCodeLibrary,
                            feature,
                            positions,
                            testCase,
                            world,
                            strict,
                            stepLocation,
                            defaultTimeout
                        }).run();
                    };
                    // Playwright reads requested fixtures from the destructured parameter of the test function
                    testBody.toString = () => fixturesSignature;
                    const details = lock.length > 0 ? { tag, annotation, lock } : { tag, annotation };
                    const testLocation = resolveLocation(positions, feature.uri, testCase.astNodeIds);
                    callAt(testLocation, test, [testCase.name, details, testBody]);
                }
            }
        ]);
    });

    registerRunHooks(
        test,
        'afterAll',
        reversed(supportCodeLibrary.afterTestRunHookDefinitions),
        HOOK_NAMES.AFTER_ALL,
        defaultTimeout
    );
}

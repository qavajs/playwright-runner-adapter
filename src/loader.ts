import { join } from 'node:path';
import { createRequire } from 'node:module';
import { supportCodeLibraryBuilder } from './supportCode';
import { PlaywrightWorld } from './PlaywrightWorld';
import { findFiles, loadFeatures } from './features';
import type { CucumberAdapterConfig, Feature, SupportCodeLibrary } from './types';

export { findFiles, loadFeatures } from './features';

/**
 * Require a step definition or support file, explaining errors of ES modules that can't be required
 */
export function requireFile(load: (id: string) => unknown, id: string): void {
    try {
        load(id);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ERR_REQUIRE_ASYNC_MODULE') {
            throw new Error(
                `Can't load ${id}: it is an ES module with top-level await (directly or in a module it imports). ` +
                    'Step definitions and support files are loaded synchronously, so top-level await is not supported; ' +
                    'move the awaited code into a BeforeAll hook or a step',
                { cause: err }
            );
        }
        if (code === 'ERR_REQUIRE_ESM') {
            throw new Error(
                `Can't load ${id}: it is an ES module, and requiring ES modules needs Node.js 22.12+ ` +
                    `(current ${process.version}). Upgrade Node.js or use CommonJS / TypeScript step definitions`,
                { cause: err }
            );
        }
        throw err;
    }
}

/**
 * Require modules by name or path resolved from the current working directory (e.g. `ts-node/register`)
 */
export function loadModules(modules: string[]): void {
    const cwdRequire = createRequire(join(process.cwd(), 'index.js'));
    for (const name of modules) {
        requireFile(cwdRequire, name);
    }
}

export function loadStepDefinitions(globPattern: string[], requireModules: string[] = []): SupportCodeLibrary {
    supportCodeLibraryBuilder.reset(process.cwd(), PlaywrightWorld);
    loadModules(requireModules);
    for (const filePath of findFiles(globPattern)) {
        requireFile(require, filePath);
    }
    return supportCodeLibraryBuilder.finalize();
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

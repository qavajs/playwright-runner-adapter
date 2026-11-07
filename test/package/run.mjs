// Smoke test of the published package: pack it, install it into fresh consumer projects
// (CommonJS, ES modules, TypeScript) and run their tests.
// Usage: node test/package/run.mjs [cjs|esm|ts ...]  (requires `npm run build` first)
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const fixtures = join(import.meta.dirname, 'fixtures');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const versionOf = name => JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf-8')).version;

const requested = process.argv.slice(2);
const setups = requested.length > 0 ? requested : readdirSync(fixtures);

const run = (command, cwd) => {
    console.log(`\n$ ${command}  (in ${cwd})`);
    execSync(command, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
};

const workDir = mkdtempSync(join(tmpdir(), 'pw-adapter-smoke-'));
try {
    run(`npm pack --pack-destination "${workDir}"`, root);
    const tarball = join(workDir, `${rootPackage.name.replace('@', '').replace('/', '-')}-${rootPackage.version}.tgz`);

    for (const setup of setups) {
        const project = join(workDir, setup);
        cpSync(join(fixtures, setup), project, { recursive: true });
        const dependencies = [`"${tarball}"`, `@playwright/test@${versionOf('@playwright/test')}`];
        if (setup === 'ts') {
            dependencies.push(`typescript@${versionOf('typescript')}`, `@types/node@${versionOf('@types/node')}`);
        }
        run(`npm install --no-audit --no-fund ${dependencies.join(' ')}`, project);
        if (setup === 'ts') run('npx tsc -p tsconfig.json', project);
        run('npx playwright test --reporter=list', project);
        console.log(`\n✔ ${setup} setup passed`);
    }
} finally {
    rmSync(workDir, { recursive: true, force: true });
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const CLOSING: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
}

/**
 * Index of the bracket closing the one at `start`, skipping nested brackets and strings
 */
function closingIndex(source: string, start: number): number {
    const stack: string[] = [];
    for (let i = start; i < source.length; i++) {
        const char = source[i];
        if (char === '"' || char === "'" || char === '`') {
            const end = source.indexOf(char, i + 1);
            if (end === -1) return -1;
            i = end;
        } else if (CLOSING[char]) {
            stack.push(CLOSING[char]);
        } else if (char === stack[stack.length - 1]) {
            stack.pop();
            if (stack.length === 0) return i;
        }
    }
    return -1;
}

/**
 * Split by commas that are not nested in brackets
 */
function splitTopLevel(source: string): string[] {
    const parts: string[] = [];
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (CLOSING[char] || char === '"' || char === "'" || char === '`') {
            i = char in CLOSING ? closingIndex(source, i) : source.indexOf(char, i + 1);
            if (i === -1) break;
        } else if (char === ',') {
            parts.push(source.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(source.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
}

function destructuringError(param: string): string {
    return `World init must destructure the fixtures it uses in its first parameter, e.g. init = ({ page }) => {}, got: ${param}`;
}

/**
 * Names of the fixtures requested by the destructured first parameter of world `init`,
 * e.g. `({ page, context: ctx }) => {}` requests `page` and `context`
 */
export function fixtureNames(init: (...args: any[]) => unknown): string[] {
    const source = stripComments(Function.prototype.toString.call(init)).trim();
    const bareParam = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(source);
    if (bareParam) throw new Error(destructuringError(bareParam[1]));
    const paramsStart = source.indexOf('(');
    const paramsEnd = paramsStart === -1 ? -1 : closingIndex(source, paramsStart);
    const params = paramsEnd === -1 ? '' : source.slice(paramsStart + 1, paramsEnd);
    const [firstParam] = splitTopLevel(params);
    if (!firstParam) return [];
    if (!firstParam.startsWith('{') || closingIndex(firstParam, 0) !== firstParam.length - 1) {
        throw new Error(destructuringError(firstParam));
    }
    return splitTopLevel(firstParam.slice(1, -1)).map(property => {
        if (property.startsWith('...')) {
            throw new Error(`World init can't use rest property "${property}", list all used fixtures explicitly`);
        }
        const name = property.split(/[:=]/)[0].trim();
        if (!IDENTIFIER.test(name)) throw new Error(`World init requests unsupported fixture name: ${name}`);
        return name;
    });
}

/**
 * Create test function whose source destructures the given fixtures,
 * so Playwright, which reads requested fixtures from the test function source, sets them up.
 * The whole fixtures object is passed to `run`.
 */
export function withFixtures(
    names: string[],
    run: (fixtures: Record<string, unknown>) => Promise<void>
): (fixtures: Record<string, unknown>) => Promise<void> {
    const params = names.length > 0 ? `{ ${names.join(', ')} }` : '';
    // fixture names are validated identifiers, so they are safe to put into the source
    return new Function('run', `return async function (${params}) { return run(arguments[0]); };`)(run);
}

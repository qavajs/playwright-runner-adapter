import { buildSnippet } from './gherkin';
import type { PickleStep } from '@cucumber/messages';
import type { StepDefinitionMatch, SupportCodeLibrary } from './types';

export type StepToFind = Pick<PickleStep, 'text' | 'argument'> & Partial<Pick<PickleStep, 'type'>>;

export interface UndefinedStep {
    pickleStep: StepToFind;
    /** `file:line` of the step, if known */
    location?: string;
}

/**
 * Find step definitions matching the step text
 */
export function findStepDefinitions(supportCodeLibrary: SupportCodeLibrary, text: string): StepDefinitionMatch[] {
    return supportCodeLibrary.stepDefinitions.filter(stepDefinition => stepDefinition.matchesStepName(text));
}

function at(location?: string): string[] {
    return location ? [`  at ${location}`] : [];
}

/**
 * Message for undefined steps with a snippet for each of them (duplicates are listed once)
 */
export function undefinedStepsMessage(
    supportCodeLibrary: Pick<SupportCodeLibrary, 'parameterTypeRegistry'>,
    steps: UndefinedStep[]
): string {
    const lines = steps.flatMap(({ pickleStep, location }) => [
        `Step '${pickleStep.text}' is not defined`,
        ...at(location)
    ]);
    const snippets = [
        ...new Set(
            steps
                .map(({ pickleStep }) => buildSnippet(supportCodeLibrary, pickleStep as PickleStep))
                .filter((snippet): snippet is string => !!snippet)
        )
    ];
    if (snippets.length === 1) {
        lines.push('', 'Implement it with the following snippet:', '', snippets[0]);
    } else if (snippets.length > 1) {
        lines.push('', 'Implement them with the following snippets:', '', snippets.join('\n\n'));
    }
    return lines.join('\n');
}

/**
 * Message for a step matching several step definitions
 */
export function ambiguousStepMessage(text: string, matches: StepDefinitionMatch[], location?: string): string {
    const definitions = matches.map(s => `  ${String(s.pattern ?? '')} - ${s.uri}:${s.line}`);
    return [`Step '${text}' matches multiple step definitions:`, ...definitions, ...at(location)].join('\n');
}

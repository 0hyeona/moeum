import { emptyStoryFields, type Analysis, type StoryFields } from './projects';

// Only populate a new draft. Existing stories and user edits are never refilled.
export function storyDraftFromAnalysis(analysis: Pick<Analysis, 'title' | 'summary' | 'before' | 'after' | 'tags'> | null): StoryFields {
  return {
    ...emptyStoryFields,
    title: analysis?.title ?? '',
    summary: analysis?.summary ?? '',
    before: analysis?.before ?? '',
    after: analysis?.after ?? '',
    tags: [...(analysis?.tags ?? [])],
    problem: analysis?.before?.trim() ? `변경 전 기록\n${analysis.before}` : '',
    solution: analysis?.summary ?? '',
    result: analysis?.after?.trim() ? `변경 후 기록\n${analysis.after}` : '',
  };
}

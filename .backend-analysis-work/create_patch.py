from pathlib import Path
import difflib
source = Path(r'C:\Users\ouskx\IdeaProjects\fastapi-practice\fastapi-practice')
modified = Path('.backend-analysis-work')
output = Path('backend-patches')
output.mkdir(exist_ok=True)
paths = ['app/services/story_analysis.py', 'app/schemas/story.py', 'app/routers/stories.py',
         'tests/test_project_content.py', 'tests/test_story_rules.py']
patches = []
for name in paths:
    original = source / name
    before = original.read_text(encoding='utf-8-sig').splitlines(keepends=True) if original.exists() else []
    after = (modified / name).read_text(encoding='utf-8-sig').splitlines(keepends=True)
    baseline = Path('.backend-analysis-baseline') / name
    baseline.parent.mkdir(parents=True, exist_ok=True)
    if original.exists():
        baseline.write_text(''.join(before), encoding='utf-8', newline='\n')
    patches.append(''.join(difflib.unified_diff(before, after,
        fromfile='a/' + name if original.exists() else '/dev/null', tofile='b/' + name)))
(output / 'story-self-analysis.patch').write_text(''.join(patches), encoding='utf-8', newline='\n')

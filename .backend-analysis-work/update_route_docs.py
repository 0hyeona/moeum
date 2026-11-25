from pathlib import Path
p = Path('.backend-analysis-work/app/routers/stories.py')
s = p.read_text(encoding='utf-8')
start = s.index('    responses={404:', s.index('"/analyze"'))
end = s.index('\n)', start)
s = s[:start] + '    responses={404: {"description": "Project or selected activity not found"}},' + s[end:]
p.write_text(s, encoding='utf-8')

from pathlib import Path
import json, zipfile
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'extension/manifest.json').read_text())
for name in ['worker.js','content.js','app.html','icons/icon16.png','icons/icon48.png','icons/icon128.png']:
    assert (root / 'extension' / name).is_file(), f'Missing {name}'
out = root / 'dist/word-memory-chrome.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for p in sorted((root / 'extension').rglob('*')):
        if p.is_file() and not p.name.startswith('.'):
            archive.write(p, 'word-memory-chrome/' + p.relative_to(root).as_posix())
    for name in ['README.md','THIRD_PARTY.md']:
        archive.write(root / name, 'word-memory-chrome/' + name)
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    assert 'word-memory-chrome/extension/manifest.json' in archive.namelist()
print(f'{out} ({out.stat().st_size:,} bytes), manifest v{manifest["version"]}')

import sqlite3
from pathlib import Path

source = Path.home() / 'AppData/Roaming/Thach may hoc Y gioi hon tao/hoc-y-app.sqlite3'
destination = Path('tmp/anatomy-ocr-test/app-data/hoc-y-app.sqlite3').resolve()
assert destination.is_relative_to(Path.cwd().resolve())
destination.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
    with sqlite3.connect(destination) as snapshot:
        original.backup(snapshot)
print('Read-only source copied to isolated anatomy test database.')

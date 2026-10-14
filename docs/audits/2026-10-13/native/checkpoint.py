"""Read-only checkpoints for the isolated native audit database.

Never reads credential values, and refuses paths outside the named test copy.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path('/tmp/lc-guidance-native-audit-cJ0ELO')
DB = ROOT / 'src-tauri/db/guidance.db'
OUT = Path(__file__).with_name('checkpoints.jsonl')

def main():
    if not DB.exists():
        raise SystemExit('Isolated test database has not been created')
    conn = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    cases = [dict(r) for r in conn.execute('SELECT id, first_name, last_name, level, date, date_filed, "case", sanction, progress, group_id, school_year, students, update_history, proofs FROM cases ORDER BY id')]
    for row in cases:
        for key in ('students', 'update_history'):
            try:
                row[key] = json.loads(row[key])
            except (TypeError, ValueError):
                pass
        try:
            row['proof_count'] = len(json.loads(row.pop('proofs')))
        except (TypeError, ValueError):
            row['proof_count'] = 'invalid'
    result = {
        'checkpoint': ' '.join(sys.argv[1:]) or 'unnamed',
        'database': str(DB),
        'integrity': conn.execute('PRAGMA integrity_check').fetchone()[0],
        'setup_complete': conn.execute("SELECT value FROM app_config WHERE key='is_setup_complete'").fetchone() is not None,
        'case_count': len(cases),
        'cases': cases,
        'ai_session_count': conn.execute('SELECT count(*) FROM ai_sessions').fetchone()[0],
    }
    with OUT.open('a') as output:
        output.write(json.dumps(result) + '\n')
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()

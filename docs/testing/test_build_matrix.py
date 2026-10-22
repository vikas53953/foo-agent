# Spec: 11-fidelity; CODEX-HANDOFF current-main evidence rule.
"""Exercise the matrix with isolated receipts; never rewrite the real ledger."""
import csv
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class MatrixEvidenceTest(unittest.TestCase):
    def test_not_built_and_manifest_are_not_coverage(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            docs = root / 'docs/testing'
            docs.mkdir(parents=True)
            (root / 'spec').mkdir()
            journeys = root / 'test/real-pc/journeys'
            journeys.mkdir(parents=True)
            shutil.copy(Path(__file__).with_name('build_matrix.py'), docs)
            def write(name, fields, rows):
                with (root / name).open('w', newline='', encoding='utf-8') as output:
                    writer = csv.writer(output, delimiter='\t')
                    writer.writerow(fields)
                    writer.writerows(rows)
            write('docs/testing/features.tsv', ['milestone', 'id', 'journey', 'text', 'built', 'built_note'], [
                ['M3', 'AT-040', '', 'Reserved feature', 'not built', 'not implemented'],
                ['M3', 'AT-056', '', 'Manifest only', 'built', ''],
                ['M3', 'AT-031', '', 'Historical receipt', 'built', ''],
            ])
            write('docs/testing/suite-status.tsv', ['key', 'state', 'sha', 'link', 'note'], [
                ['main_ci', 'green', 'a' * 40, 'https://github.com/example/repo/actions/runs/1', ''],
            ])
            write('docs/testing/real-ai-results.tsv', ['id', 'result', 'build', 'journey_or_source', 'evidence', 'note'], [
                ['AT-031', 'pass', 'b' * 40, 'historical', 'https://github.com/example/repo/blob/old/shot.png', 'Old pass'],
            ])
            (root / 'spec/trace.csv').write_text('AT / ART / PERF,Test file,Status\n', encoding='utf-8')
            (journeys / 'manifest.json').write_text(json.dumps({
                'covers': ['AT-056'], 'blockedPrerequisites': ['AT-056'],
                'steps': [{'do': 'openChat', 'name': 'foo'}, {'do': 'dump'}],
            }), encoding='utf-8')
            subprocess.run([sys.executable, str(docs / 'build_matrix.py')], check=True, capture_output=True)
            rows = {row['id']: row for row in json.loads((docs / 'coverage-matrix.json').read_text(encoding='utf-8'))['rows']}
            self.assertTrue(all(cell['s'] == 'notbuilt' for cell in rows['AT-040']['cells'].values()))
            self.assertEqual(rows['AT-056']['cells']['real_ai']['s'], 'missing')
            self.assertEqual(rows['AT-031']['cells']['real_ai']['s'], 'partial')


if __name__ == '__main__':
    unittest.main()

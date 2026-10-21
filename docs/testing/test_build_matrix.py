# Spec: 11-fidelity, linked run evidence; CODEX-HANDOFF evidence rule.
"""Run with python docs/testing/test_build_matrix.py; no external dependencies."""
import csv
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SHA = "a" * 40
LINK = "https://github.com/example/project/actions/runs/123"


class EvidenceRuleTests(unittest.TestCase):
    def generate(self, state="green", sha=SHA, ci_link=LINK, build=SHA, evidence=LINK, failing="", lane_types=(), real_result="pass"):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            docs = root / "docs" / "testing"
            docs.mkdir(parents=True)
            (root / "spec").mkdir()
            shutil.copyfile(Path(__file__).with_name("build_matrix.py"), docs / "build_matrix.py")

            def table(path, header, rows, delimiter="\t"):
                with path.open("w", encoding="utf-8", newline="") as stream:
                    writer = csv.writer(stream, delimiter=delimiter)
                    writer.writerow(header)
                    writer.writerows(rows)

            table(docs / "features.tsv", ["id", "milestone", "journey", "text"],
                  [["AT-031", "M2", "J7", "No banned filler"]])
            table(docs / "suite-status.tsv", ["key", "state", "sha", "link", "note"],
                  [["main_ci", state, sha, ci_link, ""], ["main_ci_failing", "", sha, ci_link, failing]])
            table(docs / "real-ai-results.tsv",
                  ["id", "result", "build", "journey_or_source", "evidence", "note"],
                  [["AT-031", real_result, build, "fixture", evidence, "Judged fixture"]])
            table(root / "spec" / "trace.csv", ["AT / ART / PERF", "Test file", "Status"],
                  [["AT-031", "test/unit/tone.test.ts", "live"]], ",")
            receipt = "https://github.com/example/project/blob/" + SHA + "/"
            table(docs / "lane-coverage.tsv",
                  ["id", "type", "test_id", "commit", "test_link", "report_link", "note"],
                  [["AT-031", kind, "tone", SHA, receipt + "test/tone.feature",
                    receipt + "docs/report.md", "Authored test; not merged"] for kind in lane_types])
            subprocess.run([sys.executable, str(docs / "build_matrix.py")], check=True,
                           capture_output=True, text=True)
            return json.loads((docs / "coverage-matrix.json").read_text(encoding="utf-8"))["rows"][0]["cells"]

    def test_linked_current_passing_receipts(self):
        cells = self.generate()
        self.assertEqual(cells["unit"]["s"], "proven")
        self.assertEqual(cells["real_ai"]["s"], "proven")
        self.assertIn("current main", cells["real_ai"]["why"])
        self.assertNotIn("not current main", cells["real_ai"]["why"])

    def test_incomplete_or_failed_ci_never_proves_code(self):
        for state in ["green except", "failure", "in progress", "queued"]:
            with self.subTest(state=state):
                cells = self.generate(state=state)
                self.assertEqual(cells["unit"]["s"], "partial")
                self.assertEqual(cells["regression"]["s"], "partial")

    def test_unlinked_ci_never_proves_code(self):
        for link in ["", "file:///local/run.log", "https://", LINK + " " + LINK]:
            with self.subTest(link=link):
                self.assertEqual(self.generate(ci_link=link)["unit"]["s"], "partial")

    def test_contradictory_green_with_failing_files_never_proves(self):
        cells = self.generate(failing="test/unit/tone.test.ts")
        self.assertEqual(cells["unit"]["s"], "partial")
        self.assertEqual(cells["regression"]["s"], "partial")

    def test_unlinked_real_ai_never_proves(self):
        for link in ["", "local.png", "http://example.com/log", LINK + " " + LINK]:
            with self.subTest(link=link):
                self.assertEqual(self.generate(evidence=link)["real_ai"]["s"], "partial")

    def test_short_or_old_build_never_proves_real_ai(self):
        self.assertEqual(self.generate(build="b" * 40)["real_ai"]["s"], "partial")
        cells = self.generate(sha="a" * 7, build="a" * 7)
        self.assertEqual(cells["real_ai"]["s"], "partial")
        self.assertEqual(cells["unit"]["s"], "partial")

    def test_lane_receipts_only_fill_missing_cells_as_partial(self):
        cells = self.generate(lane_types=("bdd", "unit", "real_ai", "motion"))
        self.assertEqual(cells["bdd"]["s"], "partial")
        self.assertEqual(cells["unit"]["s"], "proven")
        self.assertEqual(cells["real_ai"]["s"], "proven")
        self.assertEqual(cells["motion"]["s"], "na")
        failed = self.generate(real_result="fail", lane_types=("real_ai",))
        self.assertEqual(failed["real_ai"]["s"], "fail")


if __name__ == "__main__":
    unittest.main()

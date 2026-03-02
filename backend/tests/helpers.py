"""
Shared test helpers — ResultsWriter and subclasses.

Extracted from test_tools.py so multiple test modules can produce
structured markdown reports.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


RESULTS_DIR = Path(__file__).parent / "results"


@dataclass
class StepRecord:
    action: str
    detail: str
    data: Optional[Dict[str, Any]] = None


@dataclass
class ResultRecord:
    name: str
    section: str
    input_desc: str
    output: Optional[str] = None
    steps: List[StepRecord] = field(default_factory=list)
    passed: Optional[bool] = None
    error: Optional[str] = None


class ResultsWriter:
    """Collects test records and writes a markdown report at the end."""

    def __init__(self):
        self.records: List[ResultRecord] = []
        self._current: Optional[ResultRecord] = None

    def start_test(self, name: str, section: str, input_desc: str):
        self._current = ResultRecord(name=name, section=section, input_desc=input_desc)

    def add_step(self, action: str, detail: str, data: Optional[Dict] = None):
        if self._current:
            self._current.steps.append(StepRecord(action=action, detail=detail, data=data))

    def set_output(self, output: str):
        if self._current:
            self._current.output = output

    def set_passed(self, passed: bool):
        if self._current:
            self._current.passed = passed

    def set_error(self, error: str):
        if self._current:
            self._current.error = error
            self._current.passed = False

    def finish_test(self):
        if self._current:
            self.records.append(self._current)
            self._current = None

    def _get_sections_order(self) -> List[str]:
        """Return ordered list of section names. Override in subclasses."""
        return [
            "1. Standalone Tools",
            "2. Core Generators",
            "3. Table Tools",
            "4. Strategies",
        ]

    def _get_results_file(self) -> Path:
        """Return the output file path. Override in subclasses."""
        return RESULTS_DIR / "tool_test_results.md"

    def write(self):
        results_file = self._get_results_file()
        results_file.parent.mkdir(parents=True, exist_ok=True)

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        lines = [
            f"# Tool Test Results — {now}\n",
        ]

        # Summary
        total = len(self.records)
        passed = sum(1 for r in self.records if r.passed)
        failed = sum(1 for r in self.records if r.passed is False)
        lines.append(f"**{passed}/{total} passed** | {failed} failed\n")
        lines.append("---\n")

        for section in self._get_sections_order():
            section_records = [r for r in self.records if r.section == section]
            if not section_records:
                continue

            lines.append(f"## {section}\n")

            for rec in section_records:
                status = "PASS" if rec.passed else "FAIL"
                emoji = "+" if rec.passed else "-"
                lines.append(f"### {emoji} {rec.name} [{status}]\n")
                lines.append(f"- **Input:** {rec.input_desc}")

                if rec.steps:
                    lines.append(f"- **Steps:**")
                    for i, step in enumerate(rec.steps, 1):
                        detail_short = step.detail[:200] if step.detail else ""
                        lines.append(f"  {i}. [{step.action}] {detail_short}")

                if rec.output is not None:
                    output_display = rec.output[:500]
                    if len(rec.output) > 500:
                        output_display += "..."
                    lines.append(f"- **Output:** {output_display}")

                if rec.error:
                    lines.append(f"- **Error:** {rec.error}")

                lines.append("")

        with open(results_file, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        print(f"\n{'='*60}")
        print(f"Results written to: {results_file}")
        print(f"{'='*60}\n")


class FlowResultsWriter(ResultsWriter):
    """ResultsWriter that writes to a specified file path with custom sections."""

    def __init__(self, results_file: Path, title: str = "Flow Test Results"):
        super().__init__()
        self._results_file = results_file
        self._title = title
        self._sections: List[str] = []

    def _get_results_file(self) -> Path:
        return self._results_file

    def _get_sections_order(self) -> List[str]:
        if self._sections:
            return self._sections
        # Auto-detect from records
        seen = []
        for r in self.records:
            if r.section not in seen:
                seen.append(r.section)
        return seen

    def set_sections(self, sections: List[str]):
        self._sections = sections

    def write(self):
        results_file = self._get_results_file()
        results_file.parent.mkdir(parents=True, exist_ok=True)

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        lines = [
            f"# {self._title} — {now}\n",
        ]

        # Summary table
        total = len(self.records)
        passed = sum(1 for r in self.records if r.passed)
        failed = sum(1 for r in self.records if r.passed is False)
        lines.append(f"**{passed}/{total} passed** | {failed} failed\n")

        # Section summary table
        lines.append("| Section | Pass | Fail | Total |")
        lines.append("|---------|------|------|-------|")
        for section in self._get_sections_order():
            section_records = [r for r in self.records if r.section == section]
            if not section_records:
                continue
            sp = sum(1 for r in section_records if r.passed)
            sf = sum(1 for r in section_records if r.passed is False)
            st = len(section_records)
            lines.append(f"| {section} | {sp} | {sf} | {st} |")
        lines.append("")
        lines.append("---\n")

        for section in self._get_sections_order():
            section_records = [r for r in self.records if r.section == section]
            if not section_records:
                continue

            lines.append(f"## {section}\n")

            for rec in section_records:
                status = "PASS" if rec.passed else "FAIL"
                emoji = "+" if rec.passed else "-"
                lines.append(f"### {emoji} {rec.name} [{status}]\n")
                lines.append(f"- **Input:** {rec.input_desc}")

                if rec.steps:
                    lines.append(f"- **Steps:**")
                    for i, step in enumerate(rec.steps, 1):
                        detail_short = step.detail[:200] if step.detail else ""
                        lines.append(f"  {i}. [{step.action}] {detail_short}")

                if rec.output is not None:
                    output_display = rec.output[:500]
                    if len(rec.output) > 500:
                        output_display += "..."
                    lines.append(f"- **Output:** {output_display}")

                if rec.error:
                    lines.append(f"- **Error:** {rec.error}")

                lines.append("")

        with open(results_file, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        print(f"\n{'='*60}")
        print(f"Results written to: {results_file}")
        print(f"{'='*60}\n")

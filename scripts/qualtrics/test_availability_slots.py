"""Tests for availability_slots.py, on synthetic exports only (no real people)."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import availability_slots as av  # noqa: E402

IMPORT_ROW = ['{"ImportId":"startDate"}', '{"ImportId":"finished"}', '{"ImportId":"QID1"}',
              '{"ImportId":"QID2"}', '{"ImportId":"QID3"}']


def write(path: Path, rows: list[list[str]]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)
    return path


def multiselect_export(tmp_path: Path) -> Path:
    return write(
        tmp_path / "export.csv",
        [
            ["RecordedDate", "Finished", "Q1", "Q2", "Q3"],
            ["Recorded Date", "Finished", "Your full name", "Your wisc.edu email",
             "When are you available? Select all that apply."],
            IMPORT_ROW,
            ["2026-10-01", "True", "Test Person A", "a@wisc.edu", "Mon Oct 13 morning,Tue Oct 14 afternoon"],
            ["2026-10-01", "True", "Test Person B", "B@WISC.EDU", "Tue Oct 14 afternoon"],
            ["2026-10-02", "True", "Test Person C", "c@gmail.com", "Mon Oct 13 morning"],
            ["2026-10-02", "False", "Half Done", "h@wisc.edu", "Mon Oct 13 morning"],
            ["2026-10-03", "True", "Test Person A", "a@wisc.edu", "Wed Oct 15 evening"],
            ["2026-10-03", "True", "", "d@wisc.edu", ""],
        ],
    )


def run(path: Path):
    ids, texts, rows = av.read_export(path)
    cols = av.find_columns(ids, texts, "name", "email", "availab")
    return av.build(rows, cols)


def test_multiselect_slots_and_people(tmp_path: Path) -> None:
    result = run(multiselect_export(tmp_path))
    emails = [p.email for p in result.people]
    assert emails == ["a@wisc.edu", "b@wisc.edu", "c@gmail.com", "d@wisc.edu"]
    # The later answer from a@ replaces the earlier one.
    a = result.people[0]
    assert a.slots == ["Wed Oct 15 evening"]
    assert [p.email for p in result.slots["Tue Oct 14 afternoon"]] == ["b@wisc.edu"]
    assert [p.email for p in result.slots["Mon Oct 13 morning"]] == ["c@gmail.com"]


def test_unfinished_responses_are_skipped(tmp_path: Path) -> None:
    result = run(multiselect_export(tmp_path))
    assert "h@wisc.edu" not in [p.email for p in result.people]


def test_needs_check_reasons(tmp_path: Path) -> None:
    result = run(multiselect_export(tmp_path))
    reasons = {(p.email, r) for p, r in result.needs_check}
    assert ("c@gmail.com", "not a wisc.edu address") in reasons
    assert ("d@wisc.edu", "no name") in reasons
    assert ("d@wisc.edu", "no availability ticked") in reasons
    assert any(e == "a@wisc.edu" and "more than once" in r for e, r in reasons)


def test_matrix_style_availability(tmp_path: Path) -> None:
    path = write(
        tmp_path / "matrix.csv",
        [
            ["Q1", "Q2", "Q3_1", "Q3_2", "Q3_3"],
            ["Name", "Email",
             "Availability - Monday morning", "Availability - Monday afternoon",
             "Availability - Tuesday morning"],
            IMPORT_ROW,
            ["Test Person A", "a@wisc.edu", "1", "", "1"],
            ["Test Person B", "b@wisc.edu", "", "1", ""],
        ],
    )
    result = run(path)
    assert list(result.slots) == ["Monday morning", "Monday afternoon", "Tuesday morning"]
    assert [p.email for p in result.slots["Monday morning"]] == ["a@wisc.edu"]
    assert result.people[1].slots == ["Monday afternoon"]


def test_plain_single_header_csv(tmp_path: Path) -> None:
    path = write(
        tmp_path / "plain.csv",
        [
            ["name", "email", "availability"],
            ["Test Person A", "a@wisc.edu", "Fri morning"],
        ],
    )
    result = run(path)
    assert result.people[0].slots == ["Fri morning"]


def test_known_labels_with_commas_stay_whole() -> None:
    assert av.split_choices("Mon, Oct 13 morning,Tue", ["Mon, Oct 13 morning"]) == [
        "Mon, Oct 13 morning",
        "Tue",
    ]


def test_outputs_are_written(tmp_path: Path) -> None:
    export = multiselect_export(tmp_path)
    assert av.main([str(export), "--out", str(tmp_path / "out")]) == 0
    out = tmp_path / "out"
    for name in ("slots.csv", "people.csv", "needs_check.csv", "summary.md"):
        assert (out / name).exists(), name
    summary = (out / "summary.md").read_text(encoding="utf-8")
    assert "4 people" in summary
    assert "Check by hand" in summary

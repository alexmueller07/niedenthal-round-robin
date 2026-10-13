"""Turn the Qualtrics interest-form export into readable availability slots.

Randy, 2026-10-13: the calendar self-signup is dropped for the October sessions
in favour of a plain Qualtrics form (name, wisc.edu email, general
availability). The RA then matches people to sessions by hand and sends the
scheduling emails. This script does the tedious half of that: it reads the CSV
Qualtrics exports and writes, next to it,

    slots.csv         one row per time slot: how many people, and who
    people.csv        one row per person: which slots they ticked
    needs_check.csv   responses to look at by hand (non-wisc email, no name,
                      the same email twice, or no availability ticked)
    summary.md        the same, readable at a glance, busiest slot first

Both ways Qualtrics can ask the availability question work:
  * one "select all that apply" question -> one column, choices joined by ","
  * a matrix / one checkbox per slot     -> one column per slot, headed
    "<question> - <slot>", non-empty when ticked

Columns are found by the question text in Qualtrics' second header row, so the
form can be re-ordered without touching this script. Override with --name,
--email and --availability (case-insensitive substrings of the question text).

The outputs hold participants' names and emails. Keep them on the Research
Drive with the export, never in git (IRB 2020-1657).

Usage:
    python scripts/qualtrics/availability_slots.py export.csv [--out DIR]
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path

WISC_SUFFIX = "wisc.edu"


@dataclass
class Person:
    name: str
    email: str
    slots: list[str] = field(default_factory=list)
    recorded: str = ""


@dataclass
class Result:
    slots: "OrderedDict[str, list[Person]]"
    people: list[Person]
    needs_check: list[tuple[Person, str]]


@dataclass(frozen=True)
class Columns:
    name: list[int]
    email: int
    availability: list[int]
    #: For matrix-style availability, the slot label for each column.
    slot_labels: dict[int, str]
    recorded: int | None
    finished: int | None


def read_export(path: Path) -> tuple[list[str], list[str], list[list[str]]]:
    """Returns (ids, question texts, data rows), skipping Qualtrics' extra header rows."""
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))
    if len(rows) < 2:
        raise ValueError(f"{path} has no responses")
    ids = rows[0]
    # The legacy/standard export has three header rows: ids, question text,
    # and a row of {"ImportId": ...} JSON. A plain CSV has just the one.
    if len(rows) >= 3 and rows[2] and rows[2][0].lstrip().startswith('{"ImportId"'):
        return ids, rows[1], rows[3:]
    if len(rows) >= 2 and rows[1] and rows[1][0].lstrip().startswith('{"ImportId"'):
        return ids, ids, rows[2:]
    return ids, ids, rows[1:]


def _find(texts: list[str], needle: str) -> list[int]:
    n = needle.lower()
    return [i for i, t in enumerate(texts) if n in t.lower()]


def find_columns(
    ids: list[str],
    texts: list[str],
    name_hint: str,
    email_hint: str,
    availability_hint: str,
) -> Columns:
    email = [i for i in _find(texts, email_hint) if ids[i] not in ("RecipientEmail",)]
    if not email:
        raise ValueError(f'no column whose question mentions "{email_hint}"')
    names = [
        i
        for i in _find(texts, name_hint)
        if ids[i] not in ("RecipientFirstName", "RecipientLastName") and i not in email
    ]
    availability = [i for i in _find(texts, availability_hint) if i not in email]
    if not availability:
        raise ValueError(f'no column whose question mentions "{availability_hint}"')

    slot_labels: dict[int, str] = {}
    if len(availability) > 1:
        for i in availability:
            text = texts[i]
            slot_labels[i] = text.split(" - ", 1)[1].strip() if " - " in text else ids[i]

    def optional(column_id: str) -> int | None:
        return ids.index(column_id) if column_id in ids else None

    return Columns(
        name=names,
        email=email[0],
        availability=availability,
        slot_labels=slot_labels,
        recorded=optional("RecordedDate"),
        finished=optional("Finished"),
    )


def split_choices(value: str, known: list[str]) -> list[str]:
    """Splits a multi-select cell on commas, keeping known labels that contain one."""
    value = value.strip()
    if not value:
        return []
    out: list[str] = []
    rest = value
    # Longest known labels first, so "Mon, Oct 13 — morning" is matched whole.
    for label in sorted(known, key=len, reverse=True):
        if label and label in rest:
            out.append(label)
            rest = rest.replace(label, "")
    out.extend(part.strip() for part in rest.split(",") if part.strip())
    return out


def build(
    rows: list[list[str]],
    cols: Columns,
    known_choices: list[str] | None = None,
    include_unfinished: bool = False,
) -> Result:
    known = known_choices or []
    by_email: "OrderedDict[str, Person]" = OrderedDict()
    needs_check: list[tuple[Person, str]] = []
    slot_order: list[str] = list(cols.slot_labels.values())

    def cell(row: list[str], i: int | None) -> str:
        return row[i].strip() if i is not None and i < len(row) else ""

    for row in rows:
        if not any(c.strip() for c in row):
            continue
        if cols.finished is not None and not include_unfinished:
            if cell(row, cols.finished).lower() in ("false", "0"):
                continue
        name = " ".join(cell(row, i) for i in cols.name if cell(row, i)).strip()
        email = cell(row, cols.email).lower()
        if cols.slot_labels:
            slots = [cols.slot_labels[i] for i in cols.availability if cell(row, i)]
        else:
            slots = split_choices(cell(row, cols.availability[0]), known)
        for s in slots:
            if s not in slot_order:
                slot_order.append(s)
        person = Person(name=name, email=email, slots=slots, recorded=cell(row, cols.recorded))

        if not email:
            needs_check.append((person, "no email"))
            continue
        if not email.endswith("@" + WISC_SUFFIX) and not email.endswith("." + WISC_SUFFIX):
            needs_check.append((person, "not a wisc.edu address"))
        if not name:
            needs_check.append((person, "no name"))
        if not slots:
            needs_check.append((person, "no availability ticked"))
        if email in by_email:
            # Qualtrics exports oldest first; the later answer wins.
            needs_check.append((by_email[email], "answered more than once — kept the latest"))
        by_email[email] = person

    people = list(by_email.values())
    slots_map: "OrderedDict[str, list[Person]]" = OrderedDict((s, []) for s in slot_order)
    for person in people:
        for s in person.slots:
            slots_map[s].append(person)
    return Result(slots=slots_map, people=people, needs_check=needs_check)


def write_outputs(result: Result, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    with (out / "slots.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["slot", "count", "names", "emails"])
        for slot, people in result.slots.items():
            w.writerow(
                [slot, len(people), "; ".join(p.name for p in people), "; ".join(p.email for p in people)]
            )
    with (out / "people.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "email", "n_slots", "slots"])
        for p in sorted(result.people, key=lambda p: (len(p.slots), p.name.lower())):
            w.writerow([p.name, p.email, len(p.slots), "; ".join(p.slots)])
    with (out / "needs_check.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "email", "reason"])
        for p, reason in result.needs_check:
            w.writerow([p.name, p.email, reason])

    lines = ["# Interest-form availability", ""]
    lines.append(
        f"{len(result.people)} people · {len(result.slots)} slots · "
        f"{len(result.needs_check)} to check by hand"
    )
    lines += ["", "## Slots, busiest first", ""]
    for slot, people in sorted(result.slots.items(), key=lambda kv: -len(kv[1])):
        names = ", ".join(p.name or p.email for p in people) or "nobody"
        lines.append(f"- **{slot}** ({len(people)}): {names}")
    lines += ["", "## Hardest to place (fewest slots first)", ""]
    for p in sorted(result.people, key=lambda p: (len(p.slots), p.name.lower()))[:15]:
        lines.append(f"- {p.name or p.email} — {len(p.slots)}: {'; '.join(p.slots) or 'none'}")
    if result.needs_check:
        lines += ["", "## Check by hand", ""]
        for p, reason in result.needs_check:
            lines.append(f"- {p.name or '(no name)'} <{p.email or 'no email'}> — {reason}")
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("export", type=Path, help="CSV exported from Qualtrics")
    parser.add_argument("--out", type=Path, help="output folder (default: beside the export)")
    parser.add_argument("--name", default="name", help='question text for the name (default "name")')
    parser.add_argument("--email", default="email", help='question text for the email (default "email")')
    parser.add_argument(
        "--availability", default="availab", help='question text for availability (default "availab")'
    )
    parser.add_argument("--include-unfinished", action="store_true", help="keep partial responses")
    args = parser.parse_args(argv)

    ids, texts, rows = read_export(args.export)
    cols = find_columns(ids, texts, args.name, args.email, args.availability)
    result = build(rows, cols, include_unfinished=args.include_unfinished)
    out = args.out or args.export.with_name(args.export.stem + "-slots")
    write_outputs(result, out)
    print(
        f"{len(result.people)} people, {len(result.slots)} slots, "
        f"{len(result.needs_check)} to check -> {out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

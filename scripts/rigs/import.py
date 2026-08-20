#!/usr/bin/env python3
"""Extract Baker Hughes North America rig count data into static JSON.

Reads the "NAM Breakdown" sheet (authoritative current/WoW/YoY figures for
Location, DrillFor, Trajectory, Country, Basin and State sections) and the
"NAM Weekly" sheet (granular Country/County/Basin/DrillFor/State/Trajectory
records per publish date) from the Baker Hughes "North America Rig Count
Report" workbook, cross-validates the two, and writes one committed JSON
snapshot consumed by the Macro map rig overlay. Excel formulas never run in
the application or on Vercel -- only the stored/cached values in the
workbook are read, exactly like scripts/stock-history/import.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CELL_RE = re.compile(r"([A-Z]+)(\d+)$")

BREAKDOWN_SHEET = "NAM Breakdown"
WEEKLY_SHEET = "NAM Weekly"
# Column letters used by every section table on the NAM Breakdown sheet.
BREAKDOWN_COLUMNS = {
    "label": "B", "current": "C", "priorWeek": "D", "wow": "F", "wowPct": "H",
    "yearAgo": "J", "yoy": "L", "yoyPct": "N"
}
WEEKLY_COLUMNS = {
    "country": "A", "county": "B", "basin": "C", "gom": "D", "drillFor": "E",
    "location": "F", "state": "G", "trajectory": "H", "year": "I", "month": "J",
    "publishDate": "K", "value": "L"
}
STATE_SECTION_TERMINAL = "United States"
WEEKS_IN_HISTORY = 52


class ImportValidationError(ValueError):
    pass


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> str | None:
    value = cell.find(f"{{{MAIN_NS}}}v")
    if value is None or value.text is None:
        inline = cell.find(f"{{{MAIN_NS}}}is")
        if inline is None:
            return None
        return "".join(node.text or "" for node in inline.iter(f"{{{MAIN_NS}}}t"))
    if cell.attrib.get("t") == "s":
        try:
            return shared_strings[int(value.text)]
        except (IndexError, ValueError) as error:
            raise ImportValidationError(f"Invalid shared-string reference in {cell.attrib.get('r', 'unknown cell')}") from error
    return value.text


def _excel_date(value: str, location: str) -> str:
    try:
        serial = float(value)
        if not math.isfinite(serial):
            raise ValueError
        return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()
    except (ValueError, OverflowError) as error:
        raise ImportValidationError(f"{location}: invalid Excel date {value!r}") from error


def _number(value: str | None, location: str, *, allow_none: bool = False) -> float | None:
    if value is None or value.strip() == "":
        if allow_none:
            return None
        raise ImportValidationError(f"{location}: blank value")
    try:
        number = float(value)
    except ValueError as error:
        raise ImportValidationError(f"{location}: non-numeric value {value!r}") from error
    if not math.isfinite(number):
        raise ImportValidationError(f"{location}: non-finite value {value!r}")
    return number


def _shared_strings(archive: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")) for item in root]


def _sheet_map(archive: ZipFile) -> tuple[dict[str, str], ET.Element]:
    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    relationships = {node.attrib["Id"]: node.attrib["Target"] for node in rels_root.findall(f"{{{PKG_REL_NS}}}Relationship")}
    targets: dict[str, str] = {}
    for node in workbook_root.findall(f".//{{{MAIN_NS}}}sheet"):
        target = relationships[node.attrib[f"{{{REL_NS}}}id"]].lstrip("/")
        targets[node.attrib["name"]] = target if target.startswith("xl/") else f"xl/{target}"
    return targets, workbook_root


def _read_sheet_rows(archive: ZipFile, target: str, shared_strings: list[str]) -> dict[int, dict[str, str | None]]:
    root = ET.fromstring(archive.read(target))
    rows: dict[int, dict[str, str | None]] = {}
    for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
        cells: dict[str, str | None] = {}
        for cell in row.findall(f"{{{MAIN_NS}}}c"):
            match = CELL_RE.match(cell.attrib.get("r", ""))
            if match:
                cells[match.group(1)] = _cell_value(cell, shared_strings)
        rows[int(row.attrib["r"])] = cells
    return rows


def parse_delta_row(cells: dict[str, str | None], location: str) -> dict[str, float | None]:
    col = BREAKDOWN_COLUMNS
    return {
        "current": _number(cells.get(col["current"]), f"{location}!current"),
        "priorWeek": _number(cells.get(col["priorWeek"]), f"{location}!priorWeek"),
        "wow": _number(cells.get(col["wow"]), f"{location}!wow"),
        "wowPct": _number(cells.get(col["wowPct"]), f"{location}!wowPct", allow_none=True),
        "yearAgo": _number(cells.get(col["yearAgo"]), f"{location}!yearAgo"),
        "yoy": _number(cells.get(col["yoy"]), f"{location}!yoy"),
        "yoyPct": _number(cells.get(col["yoyPct"]), f"{location}!yoyPct", allow_none=True)
    }


def parse_breakdown(rows: dict[int, dict[str, str | None]]) -> dict[str, Any]:
    """Walk the NAM Breakdown sheet's stacked section tables top to bottom.

    Each section starts with a header row (column B holding the section
    name, column C holding the report date rather than a number) and ends
    at its "United States" or "Canada" subtotal row. Location/DrillFor/
    Trajectory repeat once for the US and once for Canada; Country/Basin/
    State appear once (US only for Basin/State).
    """
    ordered = sorted(rows.items())
    sections: dict[str, list[tuple[str, dict[str, float | None]]]] = defaultdict(list)
    current_section: str | None = None
    current_country: str = "UNITED STATES"
    section_seen: dict[str, int] = defaultdict(int)

    for row_number, cells in ordered:
        label = (cells.get("B") or "").strip() if cells.get("B") else None
        if not label:
            continue
        col_c = cells.get(BREAKDOWN_COLUMNS["current"])
        is_header = label in {"Location", "DrillFor", "Trajectory", "Country", "Basin", "State"} and col_c is not None and not _looks_numeric(col_c)
        if is_header:
            current_section = label
            section_seen[label] += 1
            current_country = "CANADA" if (label in {"Location", "DrillFor", "Trajectory"} and section_seen[label] == 2) else "UNITED STATES"
            continue
        if current_section is None:
            continue
        key = f"{current_section}[{row_number}]"
        entry = parse_delta_row(cells, f"NAM Breakdown!{key}")
        sections[current_section].append((label, current_country, entry))

    required = {"Location", "DrillFor", "Trajectory", "Country", "Basin", "State"}
    missing = required - set(sections)
    if missing:
        raise ImportValidationError(f"NAM Breakdown: missing expected section(s): {', '.join(sorted(missing))}")
    return sections


def _looks_numeric(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False


def parse_weekly(rows: dict[int, dict[str, str | None]]) -> list[dict[str, Any]]:
    ordered = sorted(rows.items())
    header_row = next((number for number, cells in ordered if cells.get("A") == "Country"), None)
    if header_row is None:
        raise ImportValidationError(f"{WEEKLY_SHEET}: header row not found")

    records: list[dict[str, Any]] = []
    errors: list[str] = []
    col = WEEKLY_COLUMNS
    for row_number, cells in ordered:
        if row_number <= header_row:
            continue
        country = cells.get(col["country"])
        if not country:
            continue
        try:
            value = _number(cells.get(col["value"]), f"{WEEKLY_SHEET}!{row_number}")
            date_raw = cells.get(col["publishDate"])
            if date_raw is None:
                raise ImportValidationError(f"{WEEKLY_SHEET}!{row_number}: missing publish date")
            records.append({
                "country": country,
                "county": cells.get(col["county"]),
                "basin": cells.get(col["basin"]),
                "drillFor": cells.get(col["drillFor"]),
                "location": cells.get(col["location"]),
                "state": (cells.get(col["state"]) or "").strip().upper() or None,
                "trajectory": cells.get(col["trajectory"]),
                "publishDate": _excel_date(date_raw, f"{WEEKLY_SHEET}!{row_number}"),
                "value": value
            })
        except ImportValidationError as error:
            errors.append(str(error))

    if errors:
        preview = "\n  - ".join(errors[:20])
        suffix = f"\n  ... and {len(errors) - 20} more" if len(errors) > 20 else ""
        raise ImportValidationError(f"{WEEKLY_SHEET}: {len(errors)} malformed row(s):\n  - {preview}{suffix}")
    if not records:
        raise ImportValidationError(f"{WEEKLY_SHEET}: no data rows found")
    return records


def build_dataset(sections: dict[str, Any], records: list[dict[str, Any]], report_date: str) -> dict[str, Any]:
    us_records = [row for row in records if row["country"] == "UNITED STATES"]
    all_dates = sorted({row["publishDate"] for row in records})
    if report_date not in all_dates:
        raise ImportValidationError(f"Report date {report_date} (from NAM Summary) has no matching NAM Weekly publish date")
    latest_date = all_dates[-1]
    if latest_date != report_date:
        raise ImportValidationError(f"NAM Weekly latest publish date {latest_date} does not match report date {report_date}")
    recent_dates = all_dates[-WEEKS_IN_HISTORY:]

    def national(section: str, label: str) -> dict[str, float | None]:
        matches = [entry for entry_label, country, entry in sections[section] if entry_label == label and country == "UNITED STATES"]
        if not matches:
            raise ImportValidationError(f"NAM Breakdown[{section}]: missing '{label}' (United States)")
        return matches[0]

    state_rows = [(label, entry) for label, country, entry in sections["State"] if country == "UNITED STATES" and label != STATE_SECTION_TERMINAL]
    tracked_states = {label.strip().upper() for label, _ in state_rows}

    def latest_week_totals(rows: list[dict[str, Any]], group_key) -> dict[Any, float]:
        totals: defaultdict[Any, float] = defaultdict(float)
        for row in rows:
            if row["publishDate"] != latest_date:
                continue
            totals[group_key(row)] += row["value"]
        return totals

    gas_oil = latest_week_totals(us_records, lambda row: (row["state"], row["drillFor"]))
    trajectory_by_state = latest_week_totals(us_records, lambda row: (row["state"], row["trajectory"]))
    county_totals = latest_week_totals(us_records, lambda row: (row["state"], row["county"], row["basin"], row["drillFor"]))

    history_by_state: defaultdict[str, defaultdict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in us_records:
        if row["publishDate"] in recent_dates:
            history_by_state[row["state"]][row["publishDate"]] += row["value"]

    states: dict[str, Any] = {}
    reconciliation_errors: list[str] = []
    for label, entry in state_rows:
        label_key = label.strip().upper()
        state_total_from_weekly = sum(value for (state, _drill), value in gas_oil.items() if state == label_key)
        if entry["current"] is not None and abs(state_total_from_weekly - entry["current"]) > 0.01:
            reconciliation_errors.append(
                f"{label}: NAM Breakdown current={entry['current']} vs NAM Weekly latest-week sum={state_total_from_weekly}"
            )

        gas = gas_oil.get((label_key, "Gas"), 0.0)
        oil = gas_oil.get((label_key, "Oil"), 0.0)
        misc = gas_oil.get((label_key, "Miscellaneous"), 0.0)

        counties = defaultdict(lambda: {"rigs": 0.0, "basins": defaultdict(float), "drillFor": defaultdict(float)})
        for (state, county, basin, drill_for), value in county_totals.items():
            if state != label_key or not county:
                continue
            bucket = counties[county]
            bucket["rigs"] += value
            bucket["basins"][basin] += value
            bucket["drillFor"][drill_for] += value
        top_counties = []
        for county, bucket in sorted(counties.items(), key=lambda item: item[1]["rigs"], reverse=True)[:5]:
            dominant_basin = max(bucket["basins"].items(), key=lambda item: item[1])[0]
            dominant_drill_for = max(bucket["drillFor"].items(), key=lambda item: item[1])[0]
            top_counties.append({
                "county": county.title(),
                "rigs": round(bucket["rigs"], 3),
                "dominantBasin": dominant_basin,
                "dominantDrillFor": dominant_drill_for
            })

        history = [{"period": d, "value": round(history_by_state[label_key].get(d, 0.0), 3)} for d in reversed(recent_dates)]

        states[state_code_for(label)] = {
            "stateName": label.title() if label.isupper() else label,
            "current": entry["current"],
            "priorWeek": entry["priorWeek"],
            "wow": entry["wow"],
            "wowPct": entry["wowPct"],
            "yearAgo": entry["yearAgo"],
            "yoy": entry["yoy"],
            "yoyPct": entry["yoyPct"],
            "commodityMix": {"gas": round(gas, 3), "oil": round(oil, 3), "misc": round(misc, 3)},
            "trajectoryMix": {
                "horizontal": round(trajectory_by_state.get((label, "Horizontal"), 0.0), 3),
                "directional": round(trajectory_by_state.get((label, "Directional"), 0.0), 3),
                "vertical": round(trajectory_by_state.get((label, "Vertical"), 0.0), 3)
            },
            "topCounties": top_counties,
            "history": history
        }

    if reconciliation_errors:
        raise ImportValidationError("State-level reconciliation failed:\n  - " + "\n  - ".join(reconciliation_errors))

    basins = [
        {"basin": label, **entry}
        for label, country, entry in sections["Basin"]
        if country == "UNITED STATES" and label != STATE_SECTION_TERMINAL
    ]
    basin_weekly_total = sum(item["current"] or 0 for item in basins)
    us_total_check = national("Basin", STATE_SECTION_TERMINAL)["current"]
    if us_total_check is not None and abs(basin_weekly_total - us_total_check) > 0.01:
        raise ImportValidationError(f"Basin totals ({basin_weekly_total}) do not reconcile to US total ({us_total_check})")

    state_total_check = sum(entry["current"] or 0 for _label, entry in state_rows)
    if abs(state_total_check - (us_total_check or 0)) > 0.01:
        raise ImportValidationError(f"State totals ({state_total_check}) do not reconcile to US total ({us_total_check})")

    return {
        "schemaVersion": 1,
        "source": {
            "provider": "Baker Hughes",
            "report": "North America Rotary Rig Count",
            "reportDate": report_date
        },
        "national": {
            "unitedStates": national("Country", "United States"),
            "canada": national("Country", "Canada"),
            "northAmerica": national("Country", "North America")
        },
        "usDrillFor": {
            "gas": national("DrillFor", "Gas"),
            "oil": national("DrillFor", "Oil"),
            "miscellaneous": national("DrillFor", "Miscellaneous")
        },
        "usTrajectory": {
            "directional": national("Trajectory", "Directional"),
            "horizontal": national("Trajectory", "Horizontal"),
            "vertical": national("Trajectory", "Vertical")
        },
        "usBasins": [
            {"basin": item["basin"], "current": item["current"], "wow": item["wow"], "wowPct": item["wowPct"], "yearAgo": item["yearAgo"], "yoy": item["yoy"], "yoyPct": item["yoyPct"]}
            for item in sorted(basins, key=lambda item: item["current"] or 0, reverse=True)
        ],
        "trackedStateCount": len(tracked_states),
        "states": states
    }


STATE_NAME_TO_CODE = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA",
    "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "FLORIDA": "FL", "GEORGIA": "GA",
    "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA",
    "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS", "MISSOURI": "MO",
    "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH",
    "OKLAHOMA": "OK", "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
    "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY"
}


def state_code_for(label: str) -> str:
    code = STATE_NAME_TO_CODE.get(label.strip().upper())
    if code is None:
        raise ImportValidationError(f"Unrecognized state name from NAM Breakdown: {label!r}")
    return code


def import_workbook(workbook: Path, output: Path) -> dict[str, Any]:
    try:
        with ZipFile(workbook) as archive:
            sheets, _workbook_root = _sheet_map(archive)
            for required in (BREAKDOWN_SHEET, WEEKLY_SHEET):
                if required not in sheets:
                    raise ImportValidationError(f"Expected sheet '{required}' not found; found {', '.join(sheets)}")
            strings = _shared_strings(archive)
            digest = hashlib.sha256(workbook.read_bytes()).hexdigest()

            breakdown_rows = _read_sheet_rows(archive, sheets[BREAKDOWN_SHEET], strings)
            weekly_rows = _read_sheet_rows(archive, sheets[WEEKLY_SHEET], strings)
    except (BadZipFile, KeyError, ET.ParseError) as error:
        raise ImportValidationError(f"Unable to read workbook structure: {error}") from error

    sections = parse_breakdown(breakdown_rows)
    records = parse_weekly(weekly_rows)
    report_date = _report_date_from_breakdown(breakdown_rows)
    dataset = build_dataset(sections, records, report_date)
    dataset["source"]["workbook"] = workbook.name
    dataset["source"]["workbookSha256"] = digest

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dataset, separators=(",", ":")) + "\n", encoding="utf-8")
    return dataset


def _report_date_from_breakdown(rows: dict[int, dict[str, str | None]]) -> str:
    for _row_number, cells in sorted(rows.items()):
        raw = cells.get(BREAKDOWN_COLUMNS["current"])
        match = re.match(r"^(\d{1,2})/([A-Za-z]{3})/(\d{2})$", raw or "")
        if cells.get("B") == "Location" and match:
            day, month_abbr, year_suffix = match.groups()
            months = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
            month = months.get(month_abbr)
            if month is None:
                raise ImportValidationError(f"Unrecognized report-date month abbreviation: {month_abbr!r}")
            return date(2000 + int(year_suffix), month, int(day)).isoformat()
    raise ImportValidationError("Could not determine report date from NAM Breakdown 'Location' header row")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Path to the Baker Hughes North America Rig Count Report .xlsx")
    parser.add_argument("--output", type=Path, default=Path("data/rigs/rig-count.json"))
    args = parser.parse_args()
    if not args.workbook.is_file():
        print(f"Workbook not found: {args.workbook}", file=sys.stderr)
        return 2
    try:
        dataset = import_workbook(args.workbook.resolve(), args.output.resolve())
    except ImportValidationError as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1
    print(f"Report date: {dataset['source']['reportDate']}")
    print(f"US total: {dataset['national']['unitedStates']['current']}")
    print(f"Tracked states: {dataset['trackedStateCount']}")
    print(f"Basins: {len(dataset['usBasins'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

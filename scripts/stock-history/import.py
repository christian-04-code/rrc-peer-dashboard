#!/usr/bin/env python3
"""Extract stored OHLCV values from Peer Stock Price.xlsx into static JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

TICKERS = ("RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR")
HEADERS = ("Date", "Open", "High", "Low", "Close", "Volume")
EXE_FIRST_TRADING_DATE = "2024-10-02"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CELL_RE = re.compile(r"([A-Z]+)(\d+)$")


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


def _number(value: str | None, location: str) -> float:
    if value is None or value.strip() == "":
        raise ImportValidationError(f"{location}: blank value")
    try:
        number = float(value)
    except ValueError as error:
        raise ImportValidationError(f"{location}: non-numeric value {value!r}") from error
    if not math.isfinite(number):
        raise ImportValidationError(f"{location}: non-finite value {value!r}")
    return number


def parse_sheet(xml: bytes, ticker: str, shared_strings: list[str]) -> tuple[list[dict[str, Any]], int, int | None]:
    root = ET.fromstring(xml)
    rows: list[tuple[int, dict[str, str | None]]] = []
    for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
        cells: dict[str, str | None] = {}
        for cell in row.findall(f"{{{MAIN_NS}}}c"):
            match = CELL_RE.match(cell.attrib.get("r", ""))
            if match:
                cells[match.group(1)] = _cell_value(cell, shared_strings)
        rows.append((int(row.attrib["r"]), cells))

    header_index = next((index for index, (_, cells) in enumerate(rows) if tuple(cells.get(column) for column in "BCDEFG") == HEADERS), None)
    if header_index is None:
        raise ImportValidationError(f"{ticker}: expected Date/Open/High/Low/Close/Volume header was not found")

    market_cap: int | None = None
    for row_number, cells in rows:
        if row_number == rows[header_index][0] + 1 and cells.get("L"):
            candidate = _number(cells["L"], f"{ticker}!L{row_number}")
            market_cap = round(candidate) if candidate > 0 else None
            break

    observations: list[dict[str, Any]] = []
    excluded = 0
    errors: list[str] = []
    for row_number, cells in rows[header_index + 1:]:
        raw = [cells.get(column) for column in "BCDEFG"]
        if all(value is None or value.strip() == "" for value in raw):
            continue
        try:
            parsed_date = _excel_date(raw[0] or "", f"{ticker}!B{row_number}")
            open_value, high, low, close, volume = (
                _number(raw[index], f"{ticker}!{column}{row_number}")
                for index, column in enumerate("CDEFG", start=1)
            )
            if min(open_value, high, low, close) <= 0:
                raise ImportValidationError(f"{ticker}!{row_number}: OHLC prices must be positive")
            if volume < 0:
                raise ImportValidationError(f"{ticker}!G{row_number}: volume cannot be negative")
            if high < max(open_value, low, close) or low > min(open_value, high, close):
                raise ImportValidationError(f"{ticker}!{row_number}: inconsistent OHLC range")
            if ticker == "EXE" and parsed_date < EXE_FIRST_TRADING_DATE:
                excluded += 1
                continue
            observations.append({
                "date": parsed_date,
                "open": open_value,
                "high": high,
                "low": low,
                "close": close,
                "volume": round(volume),
            })
        except ImportValidationError as error:
            errors.append(str(error))

    if errors:
        preview = "\n  - ".join(errors[:20])
        suffix = f"\n  ... and {len(errors) - 20} more" if len(errors) > 20 else ""
        raise ImportValidationError(f"{ticker}: {len(errors)} malformed historical row(s):\n  - {preview}{suffix}")
    if not 200 <= len(observations) <= 2_000:
        raise ImportValidationError(f"{ticker}: unreasonable observation count {len(observations)}")
    dates = [item["date"] for item in observations]
    if dates != sorted(dates):
        raise ImportValidationError(f"{ticker}: observations are not chronological")
    if len(dates) != len(set(dates)):
        raise ImportValidationError(f"{ticker}: duplicate trading dates detected")
    return observations, excluded, market_cap


def _shared_strings(archive: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")) for item in root]


def import_workbook(workbook: Path, output_dir: Path) -> list[dict[str, Any]]:
    try:
        with ZipFile(workbook) as archive:
            workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
            rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            relationships = {node.attrib["Id"]: node.attrib["Target"] for node in rels_root.findall(f"{{{PKG_REL_NS}}}Relationship")}
            sheets = {
                node.attrib["name"]: relationships[node.attrib[f"{{{REL_NS}}}id"]]
                for node in workbook_root.findall(f".//{{{MAIN_NS}}}sheet")
            }
            if tuple(sheets) != TICKERS:
                raise ImportValidationError(f"Expected sheets {', '.join(TICKERS)}; found {', '.join(sheets)}")
            strings = _shared_strings(archive)
            digest = hashlib.sha256(workbook.read_bytes()).hexdigest()
            results = []
            output_dir.mkdir(parents=True, exist_ok=True)
            for ticker in TICKERS:
                target = relationships[next(node.attrib[f"{{{REL_NS}}}id"] for node in workbook_root.findall(f".//{{{MAIN_NS}}}sheet") if node.attrib["name"] == ticker)]
                target = target.lstrip("/")
                if not target.startswith("xl/"):
                    target = f"xl/{target}"
                observations, excluded, market_cap = parse_sheet(archive.read(target), ticker, strings)
                payload = {
                    "schemaVersion": 1,
                    "ticker": ticker,
                    "source": {
                        "type": "workbook",
                        "workbook": workbook.name,
                        "sheet": ticker,
                        "priceBasis": "close",
                        "workbookSha256": digest,
                    },
                    "observationCount": len(observations),
                    "earliestDate": observations[0]["date"],
                    "latestDate": observations[-1]["date"],
                    "excludedPreTickerObservations": excluded,
                    "supplemental": {
                        "marketCap": market_cap,
                        "marketCapSource": "workbook-cached-linked-data" if market_cap else None,
                    },
                    "observations": observations,
                }
                (output_dir / f"{ticker}.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
                results.append(payload)
            return results
    except (BadZipFile, KeyError, ET.ParseError) as error:
        raise ImportValidationError(f"Unable to read workbook structure: {error}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Path to Peer Stock Price.xlsx")
    parser.add_argument("--output", type=Path, default=Path("data/stock-history"))
    args = parser.parse_args()
    if not args.workbook.is_file():
        print(f"Workbook not found: {args.workbook}", file=sys.stderr)
        return 2
    try:
        results = import_workbook(args.workbook.resolve(), args.output.resolve())
    except ImportValidationError as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1
    for item in results:
        excluded = item["excludedPreTickerObservations"]
        note = f"; excluded {excluded} pre-ticker rows" if excluded else ""
        print(f"{item['ticker']}: {item['observationCount']} observations, {item['earliestDate']} to {item['latestDate']}{note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

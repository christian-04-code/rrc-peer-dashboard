import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("stock_import", ROOT / "scripts/stock-history/import.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def worksheet(rows):
    cells = []
    for row_number, values in rows:
        row_cells = "".join(
            f'<c r="{column}{row_number}" t="str"><v>{value}</v></c>'
            for column, value in zip("BCDEFG", values)
        )
        cells.append(f'<row r="{row_number}">{row_cells}</row>')
    return ('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(cells)}</sheetData></worksheet>').encode()


class ImportTests(unittest.TestCase):
    def test_extracts_stored_ohlcv_values(self):
        rows = [(7, MODULE.HEADERS)]
        for index in range(200):
            rows.append((8 + index, (str(45000 + index), "10", "12", "9", "11", "1000")))
        observations, excluded, _ = MODULE.parse_sheet(worksheet(rows), "RRC", [])
        self.assertEqual(len(observations), 200)
        self.assertEqual(excluded, 0)
        self.assertEqual(observations[0]["close"], 11.0)
        self.assertEqual(observations[0]["volume"], 1000)

    def test_reports_malformed_rows_instead_of_dropping_them(self):
        rows = [(7, MODULE.HEADERS)]
        for index in range(200):
            close = "bad" if index == 50 else "11"
            rows.append((8 + index, (str(45000 + index), "10", "12", "9", close, "1000")))
        with self.assertRaisesRegex(MODULE.ImportValidationError, "malformed historical row"):
            MODULE.parse_sheet(worksheet(rows), "RRC", [])


if __name__ == "__main__":
    unittest.main()

import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rigs_import", ROOT / "scripts/rigs/import.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def delta_row(label, current, prior_week, wow, wow_pct, year_ago, yoy, yoy_pct):
    return {
        "B": label, "C": str(current), "D": str(prior_week), "F": str(wow), "H": str(wow_pct),
        "J": str(year_ago), "L": str(yoy), "N": str(yoy_pct)
    }


def section_header(name, date_label="14/Aug/26"):
    return {"B": name, "C": date_label}


def minimal_breakdown_rows():
    rows = {}
    r = 1
    for country_suffix, country_states in (("us", ["United States"]), ("ca", ["Canada"])):
        rows[r] = section_header("Location"); r += 1
        rows[r] = delta_row("Land", 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
        rows[r] = delta_row(country_states[0], 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
        r += 1
    for country_suffix, country_states in (("us", ["United States"]), ("ca", ["Canada"])):
        rows[r] = section_header("DrillFor"); r += 1
        rows[r] = delta_row("Gas", 6, 5, 1, 0.2, 4, 2, 0.5); r += 1
        rows[r] = delta_row("Oil", 4, 4, 0, 0.0, 4, 0, 0.0); r += 1
        rows[r] = delta_row("Miscellaneous", 0, 0, 0, 0.0, 0, 0, 0.0); r += 1
        rows[r] = delta_row(country_states[0], 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
        r += 1
    for country_suffix, country_states in (("us", ["United States"]), ("ca", ["Canada"])):
        rows[r] = section_header("Trajectory"); r += 1
        rows[r] = delta_row("Directional", 0, 0, 0, 0.0, 0, 0, 0.0); r += 1
        rows[r] = delta_row("Horizontal", 9, 8, 1, 0.125, 7, 2, 0.29); r += 1
        rows[r] = delta_row("Vertical", 1, 1, 0, 0.0, 1, 0, 0.0); r += 1
        rows[r] = delta_row(country_states[0], 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
        r += 1
    rows[r] = section_header("Country"); r += 1
    rows[r] = delta_row("United States", 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
    rows[r] = delta_row("Canada", 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
    rows[r] = delta_row("North America", 20, 18, 2, 0.11, 16, 4, 0.25); r += 1
    r += 1
    rows[r] = section_header("Basin"); r += 1
    rows[r] = delta_row("Marcellus", 6, 5, 1, 0.2, 4, 2, 0.5); r += 1
    rows[r] = delta_row("Permian", 4, 4, 0, 0.0, 4, 0, 0.0); r += 1
    rows[r] = delta_row("United States", 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
    r += 1
    rows[r] = section_header("State"); r += 1
    rows[r] = delta_row("Pennsylvania", 6, 5, 1, 0.2, 4, 2, 0.5); r += 1
    rows[r] = delta_row("Texas", 4, 4, 0, 0.0, 4, 0, 0.0); r += 1
    rows[r] = delta_row("United States", 10, 9, 1, 0.11, 8, 2, 0.25); r += 1
    return rows


def weekly_row(country, county, basin, drill_for, location, state, trajectory, publish_serial, value):
    return {
        "A": country, "B": county, "C": basin, "D": "No", "E": drill_for, "F": location,
        "G": state, "H": trajectory, "I": "2026", "J": "8", "K": str(publish_serial), "L": str(value)
    }


def minimal_weekly_rows():
    header = {"A": "Country", "B": "County", "C": "Basin", "D": "GOM", "E": "DrillFor", "F": "Location", "G": "State/Province", "H": "Trajectory", "I": "Year", "J": "Month", "K": "US_PublishDate", "L": "Rig Count Value"}
    # Excel serial 46248 = 2026-08-14, 46241 = 2026-08-07 (one week prior)
    rows = {11: header}
    rows[12] = weekly_row("UNITED STATES", "Lycoming", "Marcellus", "Gas", "Land", "PENNSYLVANIA", "Horizontal", 46248, 6)
    rows[13] = weekly_row("UNITED STATES", "Reeves", "Permian", "Oil", "Land", "TEXAS", "Horizontal", 46248, 4)
    rows[14] = weekly_row("UNITED STATES", "Lycoming", "Marcellus", "Gas", "Land", "PENNSYLVANIA", "Horizontal", 46241, 5)
    rows[15] = weekly_row("UNITED STATES", "Reeves", "Permian", "Oil", "Land", "TEXAS", "Horizontal", 46241, 4)
    return rows


class BreakdownParsingTests(unittest.TestCase):
    def test_sections_split_us_and_canada_correctly(self):
        sections = MODULE.parse_breakdown(minimal_breakdown_rows())
        self.assertEqual(set(sections), {"Location", "DrillFor", "Trajectory", "Country", "Basin", "State"})
        drill_for_countries = {(label, country) for label, country, _entry in sections["DrillFor"]}
        self.assertIn(("Gas", "UNITED STATES"), drill_for_countries)
        self.assertIn(("Gas", "CANADA"), drill_for_countries)
        state_labels = [label for label, country, _entry in sections["State"] if country == "UNITED STATES"]
        self.assertEqual(state_labels, ["Pennsylvania", "Texas", "United States"])

    def test_missing_section_raises(self):
        rows = minimal_breakdown_rows()
        rows = {r: cells for r, cells in rows.items() if cells.get("B") != "Basin"}
        with self.assertRaisesRegex(MODULE.ImportValidationError, "missing expected section"):
            MODULE.parse_breakdown(rows)


class WeeklyParsingTests(unittest.TestCase):
    def test_parses_rows_and_normalizes_state_case(self):
        records = MODULE.parse_weekly(minimal_weekly_rows())
        self.assertEqual(len(records), 4)
        self.assertEqual(records[0]["state"], "PENNSYLVANIA")
        self.assertEqual(records[0]["publishDate"], "2026-08-14")

    def test_malformed_value_is_reported_not_dropped(self):
        rows = minimal_weekly_rows()
        rows[12]["L"] = "not-a-number"
        with self.assertRaisesRegex(MODULE.ImportValidationError, "malformed row"):
            MODULE.parse_weekly(rows)


class StateCodeTests(unittest.TestCase):
    def test_known_state_resolves(self):
        self.assertEqual(MODULE.state_code_for("Pennsylvania"), "PA")
        self.assertEqual(MODULE.state_code_for("west virginia"), "WV")

    def test_unknown_state_raises(self):
        with self.assertRaises(MODULE.ImportValidationError):
            MODULE.state_code_for("Atlantis")


class ReportDateTests(unittest.TestCase):
    def test_parses_dd_mon_yy(self):
        rows = {1: section_header("Location", "14/Aug/26")}
        self.assertEqual(MODULE._report_date_from_breakdown(rows), "2026-08-14")


class BuildDatasetTests(unittest.TestCase):
    def test_reconciled_dataset_includes_expected_state_detail(self):
        sections = MODULE.parse_breakdown(minimal_breakdown_rows())
        records = MODULE.parse_weekly(minimal_weekly_rows())
        dataset = MODULE.build_dataset(sections, records, "2026-08-14")
        self.assertEqual(dataset["national"]["unitedStates"]["current"], 10)
        pa = dataset["states"]["PA"]
        self.assertEqual(pa["current"], 6)
        self.assertEqual(pa["commodityMix"], {"gas": 6.0, "oil": 0.0, "misc": 0.0})
        self.assertEqual(pa["history"][0], {"period": "2026-08-14", "value": 6.0})
        self.assertEqual(pa["history"][1], {"period": "2026-08-07", "value": 5.0})
        self.assertEqual(pa["topCounties"][0]["county"], "Lycoming")
        self.assertEqual(pa["topCounties"][0]["dominantBasin"], "Marcellus")
        tx = dataset["states"]["TX"]
        self.assertEqual(tx["commodityMix"], {"gas": 0.0, "oil": 4.0, "misc": 0.0})

    def test_state_reconciliation_mismatch_fails_loudly(self):
        sections = MODULE.parse_breakdown(minimal_breakdown_rows())
        records = MODULE.parse_weekly(minimal_weekly_rows())
        # Corrupt the Breakdown PA total so it no longer matches the NAM Weekly sum.
        sections["State"] = [
            (label, country, {**entry, "current": 999} if label == "Pennsylvania" else entry)
            for label, country, entry in sections["State"]
        ]
        with self.assertRaisesRegex(MODULE.ImportValidationError, "reconciliation failed"):
            MODULE.build_dataset(sections, records, "2026-08-14")

    def test_untracked_state_is_absent_rather_than_zero(self):
        sections = MODULE.parse_breakdown(minimal_breakdown_rows())
        records = MODULE.parse_weekly(minimal_weekly_rows())
        dataset = MODULE.build_dataset(sections, records, "2026-08-14")
        self.assertNotIn("OH", dataset["states"])


if __name__ == "__main__":
    unittest.main()

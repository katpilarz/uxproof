"""
Regression tests for ContextAgent normalisation.

The bug these pin down: the GROQ projection in services/sanity_service.py
returns an explicit `null` for every metric an uploaded report doesn't
carry, so the key IS present with a None value. `r.get("susChange", 0)`
therefore returns None, not 0, and `float(None)` raised TypeError — which
crashed the whole pipeline for any user-uploaded report that had only a
SUS score. Uploads are the product's only data source, so this broke
grounded decks and deep analysis for real users while the seeded demo
reports (which carry every field) kept working.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.context_agent import _norm_report  # noqa: E402

OPTIONAL_METRICS = [
    "susChange", "taskSuccessRate", "npsScore",
    "participants", "errorRate", "conversionRate",
]


def minimal_upload() -> dict:
    """A report as uploaded by a user: a SUS score and nothing else.

    Mirrors what the GROQ projection hands back — every absent metric and
    array present as an explicit null.
    """
    r = {
        "_id": "report_abc123_q3_2025",
        "quarter": "Q3",
        "year": 2025,
        "susScore": 82.9,
        "kpis": None,
        "issues": None,
        "insights": None,
        "methods": None,
        "client": None,
        "product": None,
        "platform": None,
    }
    r.update({field: None for field in OPTIONAL_METRICS})
    return r


def test_upload_with_only_a_sus_score_normalises():
    report = _norm_report(minimal_upload())

    assert report.sus_score == 82.9
    assert report.quarter == "Q3"
    assert report.year == 2025


@pytest.mark.parametrize("field", OPTIONAL_METRICS)
def test_each_null_metric_defaults_to_zero(field):
    """A null metric must become 0, never crash — one param per field so a
    regression names the exact metric that broke."""
    raw = minimal_upload()
    raw[field] = None

    report = _norm_report(raw)

    assert report.sus_score == 82.9  # the grounded value survives
    assert getattr(report, {
        "susChange": "sus_change",
        "taskSuccessRate": "task_success_rate",
        "npsScore": "nps_score",
        "participants": "participants",
        "errorRate": "error_rate",
        "conversionRate": "conversion_rate",
    }[field]) == 0


def test_null_arrays_become_empty_lists():
    report = _norm_report(minimal_upload())

    assert report.kpis == []
    assert report.issues == []
    assert report.insights == []
    assert report.methods == []


def test_present_values_are_not_flattened_to_zero():
    """The `or 0` guard must not swallow real data, including negatives."""
    raw = minimal_upload()
    raw.update({"susChange": -4.2, "npsScore": -7, "participants": 14})

    report = _norm_report(raw)

    assert report.sus_change == -4.2
    assert report.nps_score == -7
    assert report.participants == 14


def test_a_genuine_zero_stays_zero():
    raw = minimal_upload()
    raw["errorRate"] = 0

    assert _norm_report(raw).error_rate == 0

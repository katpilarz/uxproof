"""
services/sanity_service.py

Sanity data access for the uxproof pipeline.
  1. Content[] block normalisation uses Sanity object-type names
     (subtitleBlock | kpiItem | chartBlock | issueItem | priorityItem).
     Short aliases from the LLM are mapped to these names.
  2. _key injected on every content block AND on nested chartData series.
  3. Bullets safely wrapped as {_key, text:str}, never as
     {_key, text:<dict>}.
  4. strategicSignals: written as {_key, signal} objects; unwrapped on read.
"""

import os
import uuid
import httpx
from typing import Any

PROJECT_ID = os.getenv("SANITY_PROJECT_ID", "")
DATASET    = os.getenv("SANITY_DATASET", "production")
TOKEN      = os.getenv("SANITY_API_TOKEN", "")
API_VER    = "2024-01-01"

BASE = f"https://{PROJECT_ID}.api.sanity.io/v{API_VER}/data"


# Sanity object-type names
T_SUBTITLE = "subtitleBlock"
T_KPI      = "kpiItem"
T_CHART    = "chartBlock"
T_ISSUE    = "issueItem"
T_PRIORITY = "priorityItem"

# Map any short/legacy name the LLM might emit → Sanity object-type name
_TYPE_ALIASES = {
    "subtitle":     T_SUBTITLE,
    "subtitleblock":T_SUBTITLE,
    "text":         T_SUBTITLE,
    "kpi":          T_KPI,
    "kpiitem":      T_KPI,
    "chart":        T_CHART,
    "chartblock":   T_CHART,
    "issue":        T_ISSUE,
    "issueitem":    T_ISSUE,
    "risk":         T_ISSUE,
    "riskitem":     T_ISSUE,
    "priority":     T_PRIORITY,
    "priorityitem": T_PRIORITY,
    "recommendation": T_PRIORITY,
    "insight":      T_PRIORITY,
}

_VALID_TYPES = {T_SUBTITLE, T_KPI, T_CHART, T_ISSUE, T_PRIORITY}


def _headers() -> dict:
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def _key() -> str:
    return uuid.uuid4().hex[:12]


def _inject_keys(items: list, prefix: str = "") -> list:
    result = []
    for item in items:
        if isinstance(item, dict):
            item = dict(item)
            if "_key" not in item or not item["_key"]:
                item["_key"] = f"{prefix}{_key()}" if prefix else _key()
        result.append(item)
    return result


def _coerce_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (str, int, float, bool)):
        return str(v)
    import json as _json
    try:
        return _json.dumps(v)[:200]
    except Exception:
        return str(v)[:200]


# ── Raw helpers ───────────────────────────────────────────────────────────────

async def groq_query(query: str, params: dict | None = None) -> Any:
    url = f"{BASE}/query/{DATASET}"
    payload: dict = {"query": query}
    if params:
        payload["params"] = params
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json=payload, headers=_headers())
        r.raise_for_status()
        return r.json().get("result", [])


async def mutate(mutations: list[dict]) -> Any:
    url = f"{BASE}/mutate/{DATASET}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json={"mutations": mutations}, headers=_headers())
        r.raise_for_status()
        return r.json()


# ── Report fetchers ───────────────────────────────────────────────────────────

REPORT_FIELDS = """
  _id, reportId, quarter, year,
  client, product, platform, methods,
  susScore, susChange, taskSuccessRate, npsScore,
  participants, errorRate, conversionRate,
  kpis[]  { _key, label, value, change, trend },
  issues[] { _key, title, severity, description, recommendation },
  insights[] { _key, category, title, summary }
"""


async def fetch_report(quarter: str, year: int) -> dict | None:
    results = await groq_query(
        f'*[_type == "report" && quarter == $quarter && year == $year][0] {{ {REPORT_FIELDS} }}',
        {"quarter": quarter, "year": year},
    )
    return results or None


async def fetch_reports_by_year(year: int) -> list[dict]:
    return await groq_query(
        f'*[_type == "report" && year == $year] | order(quarter asc) {{ {REPORT_FIELDS} }}',
        {"year": year},
    )


async def fetch_all_reports() -> list[dict]:
    return await groq_query(
        f'*[_type == "report"] | order(year asc, quarter asc) {{ {REPORT_FIELDS} }}'
    )


# ── Intelligence fetcher ──────────────────────────────────────────────────────

async def fetch_intelligence(report_id: str) -> dict | None:
    result = await groq_query(
        """*[_type == "executiveIntelligence" && reportId == $reportId][0] {
          reportId, quarter, year, executiveSummary, confidenceScore,
          kpiSummaries[]{ label, value, change, trend, insight },
          metricSignals[]{ metric, current, previous, deltaPct, narrative },
          issueHighlights[]{ title, severity, signal, recommendation },
          strategicSignals[]{ signal }
        }""",
        {"reportId": report_id},
    )
    if not result:
        return None

    raw_signals = result.get("strategicSignals", []) or []
    result["strategic_signals"] = [
        s["signal"] if isinstance(s, dict) else s
        for s in raw_signals
    ]
    result["executive_summary"] = result.pop("executiveSummary", "")
    result["confidence_score"]  = result.pop("confidenceScore", 0.0)
    result["kpi_summaries"]     = result.pop("kpiSummaries", [])
    result["issue_highlights"]  = result.pop("issueHighlights", [])
    raw_signals_metric = result.pop("metricSignals", []) or []
    result["metric_signals"] = [
        {**s, "delta_pct": s.pop("deltaPct", None)}
        for s in raw_signals_metric
    ]
    return result


# ── Content[] block normalisation ─────────────────────────────────────────────

def _normalise_content_block(block: Any) -> dict | None:
    """
    Coerce a single content[] entry into a valid Sanity object with:
      - _type   = one of the named Sanity object types
      - _key    = unique
      - chart blocks: nested chartData series each have _key
    Strings and other primitives → subtitleBlock.
    """
    if isinstance(block, str):
        return {"_key": _key(), "_type": T_SUBTITLE, "text": block}
    if not isinstance(block, dict):
        return None

    out = dict(block)

    raw_t = out.get("_type") or out.get("type_")
    t = None
    if isinstance(raw_t, str):
        t = _TYPE_ALIASES.get(raw_t.lower(), raw_t if raw_t in _VALID_TYPES else None)

    if t not in _VALID_TYPES:
        # Infer from shape
        if "chartData" in out:
            t = T_CHART
        elif "label" in out and "value" in out:
            t = T_KPI
        elif "title" in out and "severity" in out:
            t = T_ISSUE
        elif "title" in out and "description" in out:
            t = T_PRIORITY
        elif "text" in out:
            t = T_SUBTITLE
        else:
            return None

    out["_type"] = t
    out.pop("type_", None)

    if "_key" not in out or not out["_key"]:
        # short prefix derived from type name
        prefix = {
            T_SUBTITLE: "sub_",
            T_KPI:      "kpi_",
            T_CHART:    "cht_",
            T_ISSUE:    "iss_",
            T_PRIORITY: "pri_",
        }[t]
        out["_key"] = f"{prefix}{_key()}"

    # _key on nested chartData series + ensure required fields
    if t == T_CHART and isinstance(out.get("chartData"), list):
        out["chartData"] = _inject_keys(out["chartData"], "series_")
        for series in out["chartData"]:
            series.setdefault("labels", [])
            series.setdefault("values", [])

    return out


# ── Persistence ───────────────────────────────────────────────────────────────

async def store_intelligence(doc: dict) -> Any:
    """
    Upsert any document. Injects _key into all Sanity array fields and
    normalises slide content[] / bullets.
    """
    doc = dict(doc)

    # Intelligence arrays
    if "kpiSummaries" in doc:
        doc["kpiSummaries"] = _inject_keys(doc["kpiSummaries"], "kpi_")
    if "metricSignals" in doc:
        doc["metricSignals"] = _inject_keys(doc["metricSignals"], "met_")
    if "issueHighlights" in doc:
        doc["issueHighlights"] = _inject_keys(doc["issueHighlights"], "iss_")
    if "strategicSignals" in doc:
        doc["strategicSignals"] = [
            {"_key": _key(), "signal": s} if isinstance(s, str)
            else ({**s, "_key": s.get("_key") or _key()} if isinstance(s, dict)
                  else {"_key": _key(), "signal": _coerce_str(s)})
            for s in doc["strategicSignals"]
        ]

    # SlidePlan arrays
    if "slides" in doc:
        slides_with_keys = []
        for slide in doc["slides"]:
            slide = dict(slide)
            if "_key" not in slide or not slide["_key"]:
                slide["_key"] = _key()

            if "content" in slide and isinstance(slide["content"], list):
                normalised = []
                for block in slide["content"]:
                    nb = _normalise_content_block(block)
                    if nb is not None:
                        normalised.append(nb)
                slide["content"] = normalised

            if "bullets" in slide and isinstance(slide["bullets"], list):
                slide["bullets"] = [
                    {"_key": _key(), "text": _coerce_str(b.get("text") if isinstance(b, dict) else b)}
                    for b in slide["bullets"]
                ]

            slides_with_keys.append(slide)
        doc["slides"] = slides_with_keys

    return await mutate([{"createOrReplace": doc}])
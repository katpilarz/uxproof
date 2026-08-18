# Aurelo Q4 2025 — Quarterly UX Research Report

**Report ID:** report-ux-q4-2025
**Period:** Q4 2025
**Client:** Aurelo
**Product / Surface:** Aurelo Merchant Dashboard — reporting module
**Platform:** internal tool
**Methods:** diary study, moderated usability testing, SUS survey

---

## Key UX Indicators

| KPI | Value | Change | Trend |
|-----|-------|--------|-------|
| SUS Score | 81.2 | +1.8 | ↑ |
| Task Success Rate | 87.3% | +2.2 | ↑ |
| NPS | +42 | +4.0 | ↑ |
| Task Error Rate | 3.7% | -0.6 | ↓ |
| Participants | 32 | +2.0 | ↑ |
| Conversion Rate | 3.2% | +0.1 | ↑ |

---

## Metric Summary

- **SUS Score:** 81.2 / 100 (+1.8 pts QoQ)
- **Task Success Rate:** 87.3%
- **NPS:** +42
- **Task Error Rate:** 3.7%
- **Research Participants:** 32
- **Key-Flow Conversion:** 3.2%

---

## Usability Issues

### Report Builder Complexity  `HIGH`

Building a monthly sales report takes 12 configuration choices; merchants save one template and never explore.

> **Recommendation:** Ship four opinionated report presets covering the tasks logged in 80% of diary entries.

### Export Format Confusion  `MEDIUM`

CSV exports flatten currency and locale formatting; accountants re-clean every file.

> **Recommendation:** Add locale-aware XLSX export with typed columns as the default.

### No Comparison Baseline  `LOW`

Reports show absolute numbers only; every diary participant computed period deltas by hand.

> **Recommendation:** Add previous-period and same-period-last-year comparison columns with change indicators.

---

## Research Insights

### Reporting Peaks Monday 7-9 AM  `behavioral`

Diary data shows a sharp Monday-morning ritual; scheduled email delivery would meet merchants where they are.

### Presets Beat Builders  `usability`

Preset prototype scored SUS 84 vs 61 for the builder — configurable power is worthless without a fast default.

### Benchmarks as Premium Feature  `opportunity`

Merchants asked repeatedly how they compare to similar shops; anonymised category benchmarks tested at 4.8/5 interest.

### Data Tables Missing Headers  `accessibility`

Generated report tables lack th scope markup, making them unnavigable with screen readers.

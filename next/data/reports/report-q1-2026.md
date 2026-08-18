# Aurelo Q1 2026 — Quarterly UX Research Report

**Report ID:** report-ux-q1-2026
**Period:** Q1 2026
**Client:** Aurelo
**Product / Surface:** Aurelo Platform — accessibility & trust audit
**Platform:** website
**Methods:** WCAG 2.2 audit, assistive-technology testing, SUS survey

---

## Key UX Indicators

| KPI | Value | Change | Trend |
|-----|-------|--------|-------|
| SUS Score | 82.9 | +1.7 | ↑ |
| Task Success Rate | 88.9% | +1.6 | ↑ |
| NPS | +46 | +4.0 | ↑ |
| Task Error Rate | 3.1% | -0.6 | ↓ |
| Participants | 28 | -4.0 | ↓ |
| Conversion Rate | 3.4% | +0.2 | ↑ |

---

## Metric Summary

- **SUS Score:** 82.9 / 100 (+1.7 pts QoQ)
- **Task Success Rate:** 88.9%
- **NPS:** +46
- **Task Error Rate:** 3.1%
- **Research Participants:** 28
- **Key-Flow Conversion:** 3.4%

---

## Usability Issues

### Contrast Failures on Sale Badges  `MEDIUM`

Pink-on-white sale badges measure 2.9:1, under the 4.5:1 requirement, across 214 templates.

> **Recommendation:** Move badges to the token system with an accessible colour pair and automated contrast checks in CI.

### Cookie Banner Keyboard Order  `HIGH`

The consent banner traps focus but its buttons come last in tab order; keyboard users tab through the whole page first.

> **Recommendation:** Set initial focus to the banner, keep a logical order, and restore focus on dismissal.

### Video Content Lacks Captions  `LOW`

Product story videos ship without captions or transcripts.

> **Recommendation:** Add auto-generated captions with editorial review to the media pipeline.

---

## Research Insights

### Two Years of Fixes Compound  `accessibility`

The audit passes 91% of WCAG 2.2 AA criteria, up from 64% in the first 2024 baseline — regressions now cluster in marketing templates.

### Trust Signals Drive the SUS Gain  `usability`

Participants cite transparent pricing and honest reviews — both prior-quarter fixes — as reasons for the record 82.9 SUS.

### Assistive-Tech Users Are Loyal  `behavioral`

Screen-reader participants who succeed once return at twice the average rate; accessibility is retention work.

### Publish the Accessibility Statement  `opportunity`

A public conformance statement with a feedback channel closes the loop and is required for the EU Accessibility Act.

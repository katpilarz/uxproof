# Aurelo Q1 2025 — Quarterly UX Research Report

**Report ID:** report-ux-q1-2025
**Period:** Q1 2025
**Client:** Aurelo
**Product / Surface:** Aurelo Design System — adoption audit
**Platform:** design system
**Methods:** component audit, developer survey, heuristic evaluation

---

## Key UX Indicators

| KPI | Value | Change | Trend |
|-----|-------|--------|-------|
| SUS Score | 76.0 | +1.2 | ↑ |
| Task Success Rate | 80.5% | +1.6 | ↑ |
| NPS | +29 | +3.0 | ↑ |
| Task Error Rate | 5.5% | -0.4 | ↓ |
| Participants | 21 | -6.0 | ↓ |
| Conversion Rate | 2.7% | +0.1 | ↑ |

---

## Metric Summary

- **SUS Score:** 76.0 / 100 (+1.2 pts QoQ)
- **Task Success Rate:** 80.5%
- **NPS:** +29
- **Task Error Rate:** 5.5%
- **Research Participants:** 21
- **Key-Flow Conversion:** 2.7%

---

## Usability Issues

### Inconsistent Button Variants  `HIGH`

Nineteen visually distinct button styles are live across the shop and dashboard; four exist in the design system.

> **Recommendation:** Deprecate ad-hoc styles, publish migration codemods, and gate new variants behind design review.

### Undocumented Form Patterns  `MEDIUM`

Validation, error placement and helper text differ per team; the system documents none of them.

> **Recommendation:** Ship a forms chapter covering validation timing, error copy tone and accessibility annotations.

### Token Drift in Dark Mode  `MEDIUM`

Hardcoded hex values bypass colour tokens in 31% of audited screens, breaking dark-mode contrast.

> **Recommendation:** Add a lint rule that flags raw hex values and map the offenders to semantic tokens.

---

## Research Insights

### Consistency Gaps Surface in Test Sessions  `usability`

Participants hesitated when identical actions looked different across surfaces — component drift is a user-facing problem, not a code-quality one.

### System Adoption Correlates With Velocity  `opportunity`

Teams above 80% component adoption ship UI stories 30% faster; the audit gives the business case for investment.

### Developers Copy the Nearest Screen  `behavioral`

Survey shows devs copy patterns from adjacent code, not documentation — the system must live where the code lives.

### Focus Styles Removed Ad Hoc  `accessibility`

Custom CSS strips focus outlines on 12 audited flows; the token-level fix restores them globally.

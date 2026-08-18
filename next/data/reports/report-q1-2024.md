# Aurelo Q1 2024 — Quarterly UX Research Report

**Report ID:** report-ux-q1-2024
**Period:** Q1 2024
**Client:** Aurelo
**Product / Surface:** Aurelo Web Shop — checkout flow
**Platform:** e-commerce
**Methods:** moderated usability testing, analytics funnel audit, SUS survey

---

## Key UX Indicators

| KPI | Value | Change | Trend |
|-----|-------|--------|-------|
| SUS Score | 68.2 | +0.0 | ↑ |
| Task Success Rate | 71.4% | +0.0 | ↑ |
| NPS | +12 | +0.0 | ↑ |
| Task Error Rate | 8.4% | +0.0 | ↓ |
| Participants | 18 | +0.0 | ↑ |
| Conversion Rate | 2.1% | +0.0 | ↑ |

---

## Metric Summary

- **SUS Score:** 68.2 / 100 (+0.0 pts QoQ)
- **Task Success Rate:** 71.4%
- **NPS:** +12
- **Task Error Rate:** 8.4%
- **Research Participants:** 18
- **Key-Flow Conversion:** 2.1%

---

## Usability Issues

### Checkout Form Overload  `HIGH`

The single-page checkout asks for 19 fields at once; 7 of 18 participants abandoned at the address block.

> **Recommendation:** Split checkout into three focused steps with a visible progress indicator and inline validation.

### Hidden Delivery Costs  `HIGH`

Shipping fees appear only at the payment step. Participants described the late reveal as a trust breaker.

> **Recommendation:** Surface estimated delivery cost on the cart page and in the mini-cart summary.

### Guest Checkout Buried  `MEDIUM`

The guest option renders below the fold under the login form; 5 participants created unwanted accounts.

> **Recommendation:** Present "Continue as guest" as an equal-weight choice on the checkout entry screen.

---

## Research Insights

### Checkout Is the Primary Conversion Leak  `usability`

Funnel analytics corroborate the lab findings: 61% of drop-off happens between cart and payment, concentrated on the address form.

### Users Price-Check Mid-Checkout  `behavioral`

A third of participants opened a second tab to re-verify totals, signalling low confidence in the displayed pricing.

### Form Labels Fail Screen Readers  `accessibility`

Placeholder-only labels disappear on focus; NVDA users could not recover field context. WCAG 3.3.2 failure.

### Express Payment Shortcut  `opportunity`

Participants who saw the Apple Pay prototype completed purchase 2.4× faster; a promising quick win for mobile traffic.

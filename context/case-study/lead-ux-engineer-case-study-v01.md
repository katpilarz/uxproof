---
document: lead-ux-engineer-case-study
version: v01
date: 2026-08-19
scope: >
  Application / interview package for the Relativity "UX Engineer" role
  (req 26-0281, RelativityOne, Kraków-hybrid) positioned at Lead level.
  Continues the case-study work in context/case-study/case-studies.ts:
  maps every role requirement to verifiable evidence in this repository,
  and scripts a 12-slide implementation walkthrough (on-slide content +
  speaker notes) grounded in the actual architecture
  (context/implementation/implementation-architecture-v01.md).
grounding-note: >
  Every claim below was verified against the working tree on 2026-08-19.
  Code references are real file paths; accessibility claims were grepped,
  not assumed. Known gaps are stated in §4 — do not remove them; honesty
  about limitations is part of the pitch.
---

# uxproof → Lead UX Engineer (Relativity, RelativityOne)

**Thesis of the application:** the role asks for someone who owns the
*experience layer* of a complex product — interaction quality, accessibility,
consistency, edge states — and who can *review and elevate AI-generated UI*.
uxproof is a complete, working demonstration of exactly that: a solo-built
AI product where the experience layer **is** the product, the design system is
enforced in code, every AI output passes a codified review bar, and the unhappy
paths are designed states rather than error toasts.

The pitch in one sentence:

> *"I built an AI product that presents research to clients — a domain where,
> like legal tech, a single invented number destroys trust. Here is how I
> designed the boundary, the guardrails, the edge states, and the review bar
> that make that safe — and how the same thinking transfers to RelativityOne."*

Why the framing fits Relativity specifically: RelativityOne is e-discovery —
evidence handling for legal teams. uxproof's core invariant (*the model never
invents data; every number is traceable to a source document*) is the same
trust problem in miniature. That parallel should open the presentation and
close it.

---

## 1. Requirement → evidence map

Every row is citable in an interview. File paths are repo-relative.

### Role responsibilities

| Relativity asks for | uxproof evidence |
|---|---|
| Partner with design/PM/engineering to create intuitive, accessible, cohesive experiences | Solo build covering all three seats end-to-end: product concept → UX → React frontend → agent pipeline → deck renderer. The typed contracts between layers (`agent-service/schemas/`, `next/src/types/`, Sanity schemas) are literally the artifacts cross-functional partners would share. |
| Design, build, refine React UIs with usability, accessibility, responsiveness, consistency focus | `next/src/components/` — React 19 + Tailwind 4 client components; 58 `aria-*` attributes across 17 components; strict server/client component convention (pages SSR, interaction in `'use client'` components) upheld across the app. |
| Improve interaction quality: workflows, edge states, accessibility, visual polish | Presentation card is an explicit state machine (`idle → generating → ready → downloading → error`, `presentation-preview.tsx:54`); restored sessions render cards idle and never re-fire generations; empty workspace gets an upload prompt, not demo data; optimistic upload turns with honest failure states. |
| **Review and elevate AI-generated UI** to product / a11y / design-system standards | The review bar is codified, not remembered: `CLAUDE.md` encodes the invariants every AI-generated change is checked against (no model-authored numbers, fallback per model step, one template source of truth, server/client convention). A custom agent fleet enforces ceremony: documentarian (`context/implementation/`), auditor (`context/audit-results/`), tester (`context/test-results/`) — drift caught by process, not memory. |
| Contribute reusable patterns and components improving consistency and scalability | One content-block contract (`kpiItem`, `chartBlock`, `issueItem`, `priorityItem`…) mirrored across three languages — Sanity schema, TypeScript types + GROQ projections, Pydantic models — so a new slide element is defined once and understood everywhere; malformed instances fail loudly at the seam. |
| Identify and address UX issues via prototyping, implementation, testing, iteration | Versioned self-audit trail in `context/` (audit-results, test-results, implementation docs) including honest known-limitations sections; the guardrail architecture itself came from iterating on observed model failures. |
| Advocate for accessibility, usability, experience quality across the lifecycle | Accessibility is in component primitives (`ui/button.tsx`, `ui/accordion.tsx`, `ui/input.tsx` carry aria plumbing), not bolted on per screen. |
| Mentor teams on UX best practice, frontend craft, AI-assisted workflows | The `CLAUDE.md` + agent-fleet pattern *is* a transferable mentoring artifact: it turns one person's judgement into rules a team (or a model) can be held to. Lead-level talking point: this is how you scale a quality bar beyond yourself. |

### Minimum qualifications

| Requirement | Evidence |
|---|---|
| Accessible, responsive React applications | Next.js 16 / React 19 app; labelled icon-only controls (`chat-interface.tsx:437,454`), `aria-current` on active conversation (`chat-history-sidebar.tsx:215`), keyboard-revealed hover actions (`focus-visible:opacity-100`, `chat-history-sidebar.tsx:256`), `aria-expanded` accordions (`files-view.tsx:206`), polite live-region toasts (`toaster.tsx:111-112`), `role="alert"` on auth errors (`login-screen.tsx:138`). |
| HTML, CSS, JS/TS, modern React | TypeScript throughout `next/`; Tailwind 4 design tokens in `globals.css`; Zustand store composed of four slices; framer-motion for movement. |
| Accessibility standards / inclusive design | See above, plus honest gap tracking (§4) — knowing what's *missing* (reduced-motion support) is part of the standard. |
| Problem-solving, debugging, communication | The implementation-architecture doc (`context/implementation/implementation-architecture-v01.md`) — 540 lines of self-documented system, including a Known Limitations section that flags the author's own inconsistencies. |
| Code reviews and cross-functional collaboration | Codified review invariants + agent-run audits; the git policy in `CLAUDE.md` shows deliberate process discipline. |
| Translate design intent into polished production experiences | The deck renderer: design intent (monochrome, hairline rules, Space Grotesk/DM Sans/DM Mono, fixed 8-slide rhythm) enforced in one module (`next/src/lib/branding/brand.ts`) — there is *no way* to ship an off-brand slide. |

### Preferred qualifications

| Requirement | Evidence |
|---|---|
| Design systems / reusable component architecture | `brand.ts` single source of truth; `ui/` primitive library; typed content-block system spanning three services. |
| Evaluate and improve workflows / experience quality | Chat-first workflow design: intent routing (`casual / presentation / deep / data / file-summary`), affirmative-follow-up resolution ("yes" after an offer becomes a real request), period inheritance from history — conversation repair as UX engineering. |
| **AI-assisted development tools to prototype, build, refine UI** | Built with an agentic AI pair under a codified quality bar; the strongest differentiator for this posting — see slide 11. |
| Visual, interaction, product judgement | The division-of-authority model (slide 3): deciding what the model may own *before* deciding what it can do is a product-judgement artifact, not a technical one. |

**Posting's Required Skills line** (CSS, Design Systems, Information
Architecture, Interaction Design, Prototyping, UX/UI Design, User Research,
Wireframing): uxproof covers all but formal user research *output* — and the
product itself is a UX-research *tooling* play, which is the credible bridge:
the author runs a research practice and built this to serve it.

---

## 2. Implementation slide deck — "Designing the experience layer of an AI product"

Format: 12 slides, ~30 min talk + Q&A. Each slide lists **VISUAL** (what's on
screen — five diagrams already exist in `context/case-study/diagrams/`),
**ON-SLIDE** (the only text the audience reads), and **SAY** (speaker notes).
Monochrome slide styling to match the uxproof deck language — the medium
demonstrates the design system.

---

### Slide 1 — Title

**VISUAL:** Product shot of the chat home (upload button, quick actions).
**ON-SLIDE:**
> **uxproof** — shipping an AI product where the experience layer *is* the product
> Katarzyna Pilarz · Lead UX Engineer case study
**SAY:** I'm going to walk through a product I built solo — concept, UX,
frontend, AI pipeline, renderer — because it demonstrates the exact job this
role describes: owning interaction quality, accessibility, consistency, and
the review bar for AI-generated output. It's an AI tool that turns uploaded UX
research into client-ready decks. The catch that makes it interesting: it
presents *numbers* to *clients*. Like e-discovery, it's a domain where one
invented fact destroys the product's reason to exist.

### Slide 2 — The problem and the constraints

**VISUAL:** Three constraint cards, monochrome.
**ON-SLIDE:**
> Turn quarterly research into client decks — through conversation.
> 1. An AI presenting research to clients **cannot hallucinate a number. Not rarely — never.**
> 2. Research data is confidential → **inference stays on the machine.**
> 3. A local model will be slow, wrong, or down → **the product must work without it.**
**SAY:** Constraint 1 disqualifies "let the LLM write the deck" before you
start. Constraints 2 and 3 come as a pair: local-only inference is a privacy
feature, but local models fail more, so availability had to be designed, not
hoped for. Everything else in this talk follows from these three lines.

### Slide 3 — The first design artifact wasn't a screen

**VISUAL:** `diagrams/uxproof-diagram-authority.svg` — division of authority.
**ON-SLIDE:**
> **Decide what the model may own before deciding what it can do.**
> Model owns: selection, narration, prose→structure conversion.
> Code owns: every number, slide structure, styling, availability.
> Between them: a validation gate. Output that fails is **discarded, not repaired.**
**SAY:** This is the judgement call I'd defend as the most important in the
project. Once the boundary existed, most later decisions stopped being
debates — every guardrail, fallback, and edge state is this one boundary
applied to another surface. For a UX Engineer reviewing AI-generated UI at
Relativity, this is the same skill: the review bar has to be *architectural*,
not case-by-case taste.

### Slide 4 — Architecture: three services, typed seams

**VISUAL:** `diagrams/uxproof-diagram-architecture.svg`.
**ON-SLIDE:**
> Next.js 16 app (chat, uploads, deck render) · FastAPI agent pipeline (context → extraction → planning) · Sanity as single store · Ollama local model
> Hand-rolled orchestration. No agent framework. **Typed Pydantic contracts between agents — malformed model output fails loudly at the seam.**
**SAY:** Three services with clean seams, all on one machine. The pipeline is
deliberately plain Python — I removed the agent framework because a fixed
three-step sequence doesn't need one, and every dependency is a surface the
experience can degrade through. The seams are typed contracts, which matters
for the next slides: bad model output fails validation loudly instead of
leaking into a client deck silently.

### Slide 5 — The experience layer: chat-first, upload-grounded

**VISUAL:** Product shots: upload turn → summary → presentation card.
**ON-SLIDE:**
> Upload the research. Talk to it. Get the deck.
> + button → parsed (or guardrail-extracted) into **your** reports → "Analyse Q3 2025" → deterministic answer, conversationally rewritten → deck on demand.
> The card renders **idle**. Generation runs when the *user* clicks.
**SAY:** Workflow decisions worth pausing on: uploads are optimistic but
honest — the turn appears instantly, failure states are real states. The
follow-up message offers a presentation but never auto-fires — user-click
generation is a consent pattern, the AI proposes and the human disposes.
Intent routing handles conversation repair: a bare "yes" after an offer
becomes a real request; a period-less follow-up inherits the last-mentioned
period. That's interaction design applied to conversation.

### Slide 6 — The grounding gate

**VISUAL:** `diagrams/uxproof-diagram-guardrail.svg`.
**ON-SLIDE:**
> Prose → model conversion → **two gates:**
> every numeric field must appear **literally in the source text** — or the field is dropped;
> no grounded SUS score — **no report at all.** The file stays as reference context.
> Same rule polices chat answers and summaries: untraceable numbers → the reply is discarded for its deterministic template.
**SAY:** Asking a model to be accurate is hope; validating its output against
the source is engineering. The gate is deliberately conservative — a number
written as "seventy-two" gets dropped even though it's present. I chose false
negatives over false positives, because the cost asymmetry is total: a dropped
field is an inconvenience, an invented number in a client deck is the end of
trust. In legal tech that asymmetry is even steeper.

### Slide 7 — The fallback ladder

**VISUAL:** `diagrams/uxproof-diagram-fallbacks.svg`.
**ON-SLIDE:**
> **The LLM is an enhancement, never a dependency.**
> conversational answer → deterministic template
> document summary → structured excerpt
> prose extraction → file stored as reference
> intelligence / slide plan → rule-built equivalents
> **Model fully offline → decks still generate.**
**SAY:** Every model step has a deterministic floor, so availability is a
product property, not a model property. The UX consequence is the interesting
part: fallbacks are *quiet*. The user isn't shown a degraded-mode banner for
a single failed rewrite — they get the templated answer, which is correct,
just less conversational. Designing what the user *doesn't* need to know is
also experience design.

### Slide 8 — Edge states are the product

**VISUAL:** Triptych of UI states: empty workspace / restored session / offline answer.
**ON-SLIDE:**
> Every failure mode is a **designed state**, not an error toast.
> Empty workspace → an upload prompt, never someone else's demo data.
> Restored session → presentation cards render idle; **old messages never re-fire generations.**
> Ungrounded number → discarded, never shown.
**SAY:** The restored-session rule is my favorite small decision: auto-start
requires a fresh (<60s) message timestamp, so reopening history can never
silently kick off background AI work. It's a one-line guard that encodes a
principle — *state restoration must be free of side effects* — and it's
exactly the class of detail this role exists to catch in other teams' work.

### Slide 9 — Interaction quality you can tab through

**VISUAL:** Screenshot with focus ring visible on a hover-revealed delete action.
**ON-SLIDE:**
> Craft you can verify: **labelled, announced, keyboard-complete.**
> Every icon-only control carries a real label · hover-revealed actions also reveal on keyboard focus (`focus-visible:opacity-100`) · active conversation marked `aria-current` · toasts are polite live regions, errors are alerts · expandable summaries expose `aria-expanded` · generation card is an explicit five-state machine.
**SAY:** These are grep-able claims, not aspirations — 58 aria attributes
across 17 components, and accessibility lives in the primitives, not per
screen. One honest gap: no `prefers-reduced-motion` handling yet; it's top of
my a11y backlog and I'd rather tell you that than have you find it. Knowing
your own audit results is part of the quality bar.

### Slide 10 — A design system enforced in code, not in a PDF

**VISUAL:** `diagrams/uxproof-diagram-contracts.svg` + a deck slide beside an app screen.
**ON-SLIDE:**
> One branding module owns palette, type, geometry. One fixed 8-slide structure enforced at render time.
> **There is no way to ship an off-brand slide** — layout never passes through the model.
> One content-block contract, three languages: Sanity schema · TypeScript + GROQ · Pydantic.
> Two deliberate identities: monochrome deliverable, violet product chrome — **consistency is scoped, not global.**
**SAY:** This is the design-systems slide. Consistency at scale isn't a
style guide people remember to follow — it's a module they physically can't
route around. The three-language contract is what "reusable pattern" means in
a multi-service product: define the block once, and the CMS, the app, and the
pipeline all understand it; a malformed one fails at the seam. And the
two-identities point matters for RelativityOne: a platform's design system has
to know where one visual language ends and another begins.

### Slide 11 — Reviewing AI-generated UI: the bar is codified, not remembered

**VISUAL:** Excerpt of `CLAUDE.md` invariants + the agent fleet as three cards.
**ON-SLIDE:**
> Built *with* an agentic AI pair — under a review bar that lives in the repo:
> numbers are never model-authored · every model step has a fallback · one template source of truth · pages are server components, interaction is client components.
> A custom agent fleet runs the ceremony: **documentarian** (regenerates architecture docs from disk) · **auditor** (reviews changes against the invariants) · **tester** (versioned production-readiness reports).
> When generated output kept drifting the renderer toward one-off values — the fix wasn't a review comment. **It was codifying the rule.**
**SAY:** This is the slide that maps to the posting's most distinctive line —
"review and elevate AI-generated UI." My workflow splits the labour honestly:
generation is fast at scaffolding; I take over where judgement lives —
interaction details, edge states, accessibility, polish. The lead-level
insight: a review bar that lives in one person's head doesn't scale to a team,
and it *definitely* doesn't scale to a model. Codify it, and every future
draft — human or AI — is checked against it automatically. That's the
mentoring model I'd bring to feature teams.

### Slide 12 — Outcome, and what I'd tell the next team

**VISUAL:** The final deck fanned out; closing statement.
**ON-SLIDE:**
> From an evening of manual assembly to a sentence in a chat box.
> Every number in every deck is traceable. Research data never leaves the machine. Decks generate with the model offline.
> **Guardrails that discard beat prompts that plead.**
> Next on the roadmap: reduced-motion support · user-scoping the agent service · schema-drift cleanup.
**SAY:** Three closing thoughts. One: trust is won on the unhappy paths — the
happy path takes care of itself. Two: decide what the model may own before
deciding what it can do; that question transfers directly to every AI feature
RelativityOne ships. Three: the roadmap items on screen are from my own audit
docs — I ship with a public list of my own gaps, because that's what a quality
bar looks like from the inside. Questions?

---

## 3. Anticipated interview questions — prepared answers

**"This is a solo project. How do you work with designers and PMs?"**
Own the seams. Every layer of uxproof hands the next a typed contract — that's
the same artifact a designer handoff or PM spec becomes in a team. And the
codified-review-bar pattern (slide 11) is explicitly a collaboration tool: it
turns individual judgement into shared, checkable rules. Add: the case-study
content store itself (`case-studies.ts`) is written as a *template with
authoring rules in comments* — writing for the next contributor is a habit.

**"How would you approach RelativityOne's design system?"**
Same doctrine, bigger surface: consistency enforced at the component/token
layer so teams physically can't drift; contracts (typed props, tokens, a11y
requirements *in* the primitives) over documentation; and scoped identities —
a platform of many workflows needs to know where visual languages begin and
end (slide 10's monochrome-vs-violet point).

**"How do you evaluate AI-generated UI?"**
Three gates, in order: does it violate an invariant (grounding, fallback,
system boundaries) — architectural review; does it meet the a11y floor
(labels, focus, announcements, state exposure) — grep-able review; does it
have judgement (edge states designed, motion purposeful, copy honest) — the
part that stays human. The first two are codified so the third gets my time.

**"Where does this project fall short?"**
Answer from §4 below, unprompted and specific. Interviewers trust candidates
who volunteer their gaps with the same precision as their wins.

**"Why Relativity?"**
The trust problem is the same shape: evidence handling where provenance is
everything and an invented artifact is catastrophic. uxproof is that problem
in miniature, solved with guardrails-that-discard. And the role's "review and
elevate AI-generated UI" line describes a workflow I already run daily, with
artifacts to show.

---

## 4. Honest gaps (say them before they're found)

Sourced from the project's own audit trail
(`context/implementation/implementation-architecture-v01.md` §11):

1. **No `prefers-reduced-motion` support** — framer-motion animations don't
   yet respect the OS setting. Top of the a11y backlog; also the natural
   "what would you fix first" answer.
2. **Agent service isn't user-scoped** — acceptable single-machine, must be
   fixed before multi-user. Demonstrates threat-model awareness, not neglect.
3. **Studio schema drift** — the app writes fields the CMS schema doesn't
   declare. Known, logged, and the purge script covers the legacy type.
4. **App UI keeps accent colours while the CLAUDE.md monochrome rule reads
   broader** — resolved deliberately (deck-only monochrome), documented as a
   scoped-consistency decision (slide 10), but the rule text should be tightened.
5. **Formal usability testing** of uxproof itself hasn't been run — it's an
   internal tool with one user; the honest phrasing is "built *from* research
   practice, not yet *validated by* research."

---

## 5. Production checklist for the slides

- [ ] Render slides in the uxproof deck language (monochrome, hairline rules,
      Space Grotesk / DM Sans / DM Mono) — the medium proves the system.
- [ ] Replace placeholder product shots: chat home, upload turn + summary,
      presentation card in all five states, focus ring on the sidebar delete
      action, empty-workspace prompt, a finished deck slide.
- [ ] Export the five existing SVG diagrams (`context/case-study/diagrams/`)
      onto slides 3, 4, 6, 7, 10.
- [ ] Keep every number and file path on the slides verifiable against the
      repo — the deck about grounding must itself be grounded.
- [ ] 12 slides ≈ 30 minutes; rehearse slides 3, 6, and 11 as the spine —
      if time is cut, those three carry the argument.

---

## 6. Change log

- **v01 (2026-08-19)** — Initial version. Continues
  `context/case-study/case-studies.ts` (portfolio case study) with a
  role-targeted package: requirement→evidence map for Relativity req 26-0281,
  12-slide implementation walkthrough with speaker notes, prepared interview
  answers, and the honest-gaps register. All accessibility and interaction
  claims verified against the working tree by grep before inclusion.

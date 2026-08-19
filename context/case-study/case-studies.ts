// Case study content store.
// Each entry renders a row in the landing page's Selected work section, a row
// on /work, and a detail page at /work/[slug].
//
// TEMPLATE NOTE: the detail page renders `sections` as a flexible sequence of
// blocks — mono label (`heading`), big display statement (`lead`), a few short
// body paragraphs, and optional frames (`image` full-width after the copy,
// `gallery` as a side-by-side pair inside it). Divide a long story into more
// sections rather than growing one body; the page rhythm comes from short
// blocks separated by frames. Every case should include an Architecture
// section with a diagram frame — each case has to show the architectural
// thinking, not just the outcome.
//
// NDA NOTE: for client work, describe the problem domain + what you did. Never
// include a client or product name, or a figure precise enough to fingerprint
// an engagement. Only state a "result" you can stand behind — if something was
// a prototype, say "prototype", not "in production". Self-initiated products
// (like uxproof) may be named.

export interface CaseImage {
  src: string;
  /** Shown under the frame in mono caps. Mark placeholders as such. */
  caption: string;
  alt?: string;
}

export interface CaseSection {
  /** Short section name; keys the block. */
  heading: string;
  /** The section's key message, shown as the big display text. Falls back to the heading. */
  lead?: string;
  body: string[];
  /** Optional full-width frame rendered after the section's copy. */
  image?: CaseImage;
  /** Optional pair of supporting frames rendered inside the section. */
  gallery?: CaseImage[];
}

export interface CaseStudy {
  slug: string;
  index: string; // "01", "02"...
  title: string; // sentence case, display font
  tag: string; // short category label, shown in mono caps
  year: string;
  status: "In production" | "Built" | "Prototype" | "In progress";
  /** One line for the listing, and the lede on the detail page. */
  summary: string;
  /** Three short lines shown beside the shot on the landing page. */
  card: { problem: string; approach: string; result: string };
  /** Detail-page ledger rows, in order. */
  ledger: { k: string; v: string }[];
  /** Detail-page body — see the TEMPLATE NOTE above. */
  sections: CaseSection[];
  hero: CaseImage;
}

export const caseStudies: CaseStudy[] = [
  {
    slug: "uxproof",
    index: "01",
    title: "uxproof — AI research reporting",
    tag: "AI product / UX engineering / Human-AI collaboration",
    year: "2026",
    status: "Built",
    summary:
      "[ Designing and building a trustworthy AI workflow — from messy research files to a client-ready deck, without giving the AI control over facts, structure or quality. ]",
    card: {
      problem:
        "Quarterly UX research was slow to turn into client decks — and an AI presenting research to clients cannot invent a single number.",
      approach:
        "I designed the interaction model and built the interface end-to-end in React/TypeScript. The AI helps decide what to say; it never decides what is true.",
      result:
        "Client-ready eight-slide decks from plain language — every number traceable, and the workflow keeps working with the model offline.",
    },
    ledger: [
      {
        k: "[ Project ]",
        v: "uxproof — self-initiated concept build for my own research practice",
      },
      {
        k: "[ Role ]",
        v: "Solo, end-to-end — interaction model, UX, React/TypeScript frontend, AI behaviour, deck renderer",
      },
      {
        k: "[ Stack ]",
        v: "Next.js · React 19 · TypeScript · Zustand · FastAPI · Pydantic · Sanity · Ollama (local LLM) · pptxgenjs",
      },
      {
        k: "[ Constraints ]",
        v: "Local-only inference — research data never leaves the machine; no orchestration frameworks",
      },
      { k: "[ Status ]", v: "Working concept — built end-to-end, 2026" },
      { k: "[ Link ]", v: "Live demo — available soon" },
    ],
    sections: [
      {
        heading: "Context",
        lead: "Upload the research, talk to it, get the deck.",
        body: [
          "Quarterly UX research kept ending its life in slide decks. Every cycle meant pulling SUS scores, KPIs and findings out of different files, rebuilding the same slide structures, and checking the numbers survived the journey. I built uxproof to close that gap: a chat-first interface over grounded research data and an automated presentation workflow.",
          "It's a self-initiated concept build rather than a commercial product — the one I can show publicly. The UX engineering patterns behind it — AI boundaries, design systems, accessibility, edge states, production-quality frontend — are informed by my experience building enterprise GenAI products.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          caption: "[ PLACEHOLDER — UPLOAD FLOW / CHAT TURN — SWAP FOR PRODUCT SHOT ]",
          alt: "Placeholder for a product shot of the uxproof upload flow and a chat turn",
        },
      },
      {
        heading: "The UX problem",
        lead: "AI makes the workflow shorter — but trust becomes part of the interface.",
        body: [
          "The obvious interaction is simple: upload → ask → receive an answer → generate the presentation. The difficult part is everything underneath that apparently simple flow — an AI that presents research to clients cannot occasionally invent a number; it has to be trustworthy every time.",
          "That created three UX requirements: users interact naturally instead of learning an AI workflow; the interface clearly communicates what the system knows, what it is doing, and when something cannot be verified; and the experience stays useful when the AI is slow, unavailable or unable to produce a trustworthy answer. AI behaviour is treated as interaction design, not a black-box backend concern.",
        ],
      },
      {
        heading: "Interaction model",
        lead: "Plain language is the interface — but the system still needs structure.",
        body: [
          "The workflow is chat-first and grounded in uploaded research: “Analyse Q3 2025”, “Compare Q2 vs Q3”, “Generate the 2025 presentation”. The interface translates natural-language requests into structured product actions.",
          "The conversation itself is a designed product surface. A bare “yes” after the system offers a presentation becomes a real generation request; a follow-up without a newly specified period inherits the context of the previous exchange; an empty workspace shows a clear upload prompt instead of exposing machinery. The complexity of the underlying system disappears from the user's workflow — without hiding important system states.",
        ],
      },
      {
        heading: "Designing for trust",
        lead: "The AI can help decide what to say. It cannot decide what is true.",
        body: [
          "The most important design decision was a clear boundary between AI-generated content and deterministic product behaviour. The model can select relevant findings, narrate research, convert prose into a structured report, and help interpret the user's request. It cannot invent numbers, control presentation structure or styling, or decide whether the product can safely complete an operation.",
          "Between those responsibilities sits a validation layer: a number that cannot be grounded in the uploaded source is discarded, never repaired or guessed. That distinction became a UX principle as much as an architectural one — the interface never presents uncertainty as certainty.",
          "The gate is unit-tested rather than assumed. The suite pins down what the product accepts, what it drops, and the deliberately conservative bias behind it: a value the document phrases differently is dropped even though it's present, because a missing field is an inconvenience and an invented number is the end of trust.",
        ],
        gallery: [
          {
            src: "/uxproof-diagram-authority.svg",
            caption:
              "[ DIVISION OF AUTHORITY — WHAT THE MODEL MAY OWN, WHAT CODE MUST ]",
            alt: "Diagram of uxproof's division of authority: the model owns selection and narration on the left, code owns numbers, structure, styling and availability on the right, with a validation gate between them",
          },
          {
            src: "/uxproof-diagram-guardrail.svg",
            caption: "[ THE GROUNDING GATE — HOW PROSE BECOMES A REPORT, OR DOESN'T ]",
            alt: "Flow diagram of the grounding gate: an uploaded document passes through model conversion, then two gates — each number must appear literally in the source or the field is dropped, and without a grounded SUS score no report is created at all",
          },
        ],
      },
      {
        heading: "Building the experience",
        lead: "The interface is designed and implemented together.",
        body: [
          "I built the product in React, Next.js and TypeScript, treating interaction design and implementation as one workflow rather than a hand-off. That meant owning component behaviour, state transitions, loading and generation states, keyboard interaction, focus management, error handling, responsive behaviour, content hierarchy and reusable UI patterns as one set of decisions.",
          "This is the part of the work I value most as a UX engineer: taking an interaction from idea or prototype to something that is actually robust in code — shaped around the same model as the product design, simple on the surface, explicit underneath.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          caption:
            "[ PLACEHOLDER — GENERATION CARD STATES: IDLE / WORKING / DONE / ERROR — SWAP FOR PRODUCT SHOTS ]",
          alt: "Placeholder for product shots of the presentation card moving through its idle, working, complete and error states",
        },
      },
      {
        heading: "Edge states",
        lead: "The unhappy paths are part of the experience.",
        body: [
          "AI products expose more failure modes than conventional interfaces, so those states are first-class UX, not technical exceptions. When the local model is unavailable, the product falls back to deterministic behaviour — templated answers, excerpt summaries, rule-built plans — and the user doesn't need to understand the architecture to keep working.",
          "The quieter states are designed too: an empty workspace prompts for an upload; an ungrounded number is discarded rather than displayed; a document without a verifiable score stays useful as reference context instead of becoming a report; restored sessions never silently re-run old generations; presentation cards communicate idle, working, complete and error honestly. Failure changes the experience honestly — it doesn't just produce an error message.",
        ],
        image: {
          src: "/uxproof-diagram-fallbacks.svg",
          caption: "[ THE FALLBACK LADDER — WHAT EACH MODEL STEP DEGRADES TO ]",
          alt: "Diagram pairing each model step with its deterministic fallback: conversational answers fall back to templates, summaries to excerpts, prose conversion to reference storage, extraction and planning to rule-built equivalents",
        },
      },
      {
        heading: "Accessibility & interaction quality",
        lead: "Every interaction works beyond the happy path — and beyond the mouse.",
        body: [
          "The chat surface is fully keyboard-operable. Icon-only actions — upload, send, history, account — carry accessible labels; focus states are visible on every interactive element; and actions that appear on hover are equally available through keyboard focus, so nothing is pointer-only.",
          "State changes are communicated semantically, not just visually: toasts are polite live regions, errors are exposed as alerts, expandable content exposes its state, and the active conversation is marked for assistive technology. Motion is an enhancement rather than a requirement — the interface honours the operating system's reduced-motion preference, in both the animation library and the stylesheet.",
          "Asynchronous behaviour is part of accessibility too: uploads render optimistically, generation states are explicit, and restored sessions never unexpectedly restart old work. None of this is a layer added after the UI was designed — the interaction model itself is built around predictable state and feedback.",
        ],
      },
      {
        heading: "Design system",
        lead: "Consistency belongs in the implementation, not in a document.",
        body: [
          "The presentation output has one branding module for palette, typography and geometry, and one fixed eight-slide structure enforced at render time. The AI selects and narrates content; deterministic rules own layout and styling — there is no way to ship an off-brand slide.",
          "The same principle runs through the product: typed content blocks — KPIs, charts, issues, priorities — share one shape across the schema, the application and the pipeline, so a new content type means extending a contract rather than creating another one-off. That's what a design system is most useful for: not just visual consistency, but reducing the number of decisions every future feature has to make.",
        ],
        image: {
          src: "/uxproof-diagram-contracts.svg",
          caption:
            "[ ONE CONTRACT, THREE LANGUAGES — THE SCHEMA, THE APP AND THE PIPELINE SHARE A SHAPE ]",
          alt: "Diagram showing one content-block contract mirrored in three places: the Sanity content schema, the TypeScript types and GROQ projections in the app, and the Pydantic models in the agent pipeline",
        },
      },
      {
        heading: "Architecture",
        lead: "The architecture exists to protect the experience.",
        body: [
          "The system splits into clear responsibilities: a Next.js application owns the interface, chat, uploads and deck rendering; a FastAPI service builds slide plans; a content store holds reports, sessions and plans; and a local model provides inference, so research data never leaves the machine. Typed contracts validate every model-driven step — malformed output fails loudly at a seam instead of leaking into a client deck.",
          "The architecture deliberately mirrors the UX boundary set earlier: the model contributes intelligence, while deterministic code protects facts, structure, styling and availability. The technical design isn't separate from the user experience — it is what makes the intended experience reliable.",
        ],
        image: {
          src: "/uxproof-diagram-architecture.svg",
          caption:
            "[ SYSTEM ARCHITECTURE — THREE SERVICES, TYPED SEAMS, EVERYTHING ON ONE MACHINE ]",
          alt: "Diagram of the uxproof architecture: a React browser client, the Next.js app with intent routing, grounding gate and deck renderer, connected to a Sanity content store, a FastAPI agent pipeline, and a local Ollama model — all inside a single-machine boundary",
        },
      },
      {
        heading: "AI-assisted engineering",
        lead: "AI accelerates implementation. The quality bar still belongs to the engineer.",
        body: [
          "uxproof is built with an AI-assisted development workflow. Generation is effective at scaffolding, repetitive implementation, refactoring and test plumbing; I own the parts where product and UX judgement matter — interaction quality, accessibility, edge states, visual consistency, and the relationship between design intent and implementation.",
          "The quality bar is codified in the project rather than relying on memory: numbers are never model-authored, every model step has a fallback, the presentation template has one source of truth, and generated UI must conform to the established system. When generated output repeatedly introduced one-off spacing values and accent colours into the deck renderer, the fix wasn't correcting each instance — I moved the rule into the branding module and the project constraints, so future generated code is constrained by the system itself. That's the role of AI-assisted development: move faster without lowering the UX quality bar.",
        ],
      },
      {
        heading: "Outcome",
        lead: "A complex research-to-presentation workflow becomes a sentence in a chat box.",
        body: [
          "Upload research, ask for a period or a comparison, request a presentation — no reporting workflow to navigate. The resulting deck uses the same structure and branding every time; every number is read from stored research or validated against the uploaded source; and deterministic fallbacks keep the core workflow functional when the AI is unavailable.",
          "It demonstrates the principle I design AI interfaces around: the best AI experience is not the one that exposes the most intelligence — it's the one that makes useful intelligence feel predictable, understandable and trustworthy.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          caption: "[ uxproof — chat home: upload, quick actions, generation prompts ]",
          alt: "uxproof running on a laptop — a chat-first home screen with a file-upload button, chat history, and quick-action prompts for generating presentations",
        },
      },
      {
        heading: "What I'd carry forward",
        lead: "Design the boundary before designing the feature.",
        body: [
          "The most useful lesson from uxproof wasn't a particular AI pattern. It was deciding early what the model should own, what the product must own, and what the user needs to understand. Once those boundaries were clear, interaction states, fallbacks, accessibility decisions, component contracts and architecture became much easier to reason about.",
          "For complex AI products, I'd start there every time: define responsibility → design the interaction → build the system → validate the edge states → codify the pattern.",
        ],
      },
    ],
    hero: {
      src: "/uxproof-mockup.jpg",
      caption: "[ uxproof — chat home: upload, quick actions, generation prompts ]",
      alt: "uxproof running on a laptop — a chat-first home screen with a file-upload button, chat history, and quick-action prompts for generating presentations",
    },
  },
];

export const getCaseStudy = (slug: string): CaseStudy | undefined =>
  caseStudies.find((c) => c.slug === slug);

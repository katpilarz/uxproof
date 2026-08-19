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
    tag: "AI product / Multi-agent system",
    year: "2026",
    status: "Built",
    summary:
      "[ A chat-first AI tool that turns uploaded UX research into client-ready, brand-locked PowerPoint decks — grounded numbers, deterministic fallbacks. ]",
    card: {
      problem:
        "Quarterly UX research was slow to turn into client decks — and an AI presenting research to clients cannot hallucinate a single number.",
      approach:
        "A chat-first interface over a multi-agent pipeline. Uploads ground every figure; a local LLM enhances answers, never carries them.",
      result:
        "Brand-locked eight-slide decks from plain language — every number traceable, and decks still generate with the model offline.",
    },
    ledger: [
      {
        k: "[ Project ]",
        v: "uxproof — self-initiated concept build for my own research practice",
      },
      {
        k: "[ Role ]",
        v: "Solo build — product concept, UX, frontend, agent pipeline, deck renderer",
      },
      {
        k: "[ Stack ]",
        v: "Next.js · React 19 · TypeScript · Zustand · FastAPI · Pydantic · Sanity · Ollama (local LLM) · pptxgenjs",
      },
      {
        k: "[ Constraints ]",
        v: "Local-only inference — research data never leaves the machine; no orchestration frameworks",
      },
      {
        k: "[ Provenance ]",
        v: "A concept, not a commercial product — the patterns it demonstrates (grounding gates, typed contracts, deterministic fallbacks) come from production systems I've shipped",
      },
      { k: "[ Status ]", v: "Working concept — built end-to-end, 2026" },
    ],
    sections: [
      {
        heading: "Context",
        lead: "Upload the research, talk to it, get the deck.",
        body: [
          "Quarterly UX research kept ending its life in slide decks. Every cycle meant pulling SUS scores, KPIs and findings out of files by hand, rebuilding the same slide structures, and hoping the numbers survived the copy-paste. uxproof is the tool I built to close that gap.",
          "A note on what this is: a concept build, not a production product. It runs end-to-end on my own research practice — real uploads, real decks — but it exists to demonstrate an architecture, not to ship to customers. The patterns inside it are the same ones I've used in production AI products built under NDA; uxproof is the version I can show.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          caption: "[ PLACEHOLDER — UPLOAD FLOW / CHAT TURN — SWAP FOR PRODUCT SHOT ]",
          alt: "Placeholder for a product shot of the uxproof upload flow and a chat turn",
        },
      },
      {
        heading: "Workflow",
        lead: "Plain language is the whole interface.",
        body: [
          "The workflow is chat-first and upload-grounded. Research files go in through the chat's plus button; structured data — quarter, year, SUS score — is parsed into per-user reports, and prose documents are converted by a local model under a strict guardrail. From there it's plain language: “Analyse Q3 2025”, “Compare Q2 vs Q3”, “Generate the 2025 presentation”.",
          "The conversation itself is designed, not just parsed. A bare “yes” after the tool offers a presentation becomes a real generation request; a follow-up question with no period named inherits the last one discussed; a workspace with no data gets an upload prompt instead of machinery running on nothing.",
        ],
      },
      {
        heading: "Problem",
        lead: "An AI that presents research to clients cannot hallucinate a number — not rarely, never.",
        body: [
          "That one requirement disqualifies the default “let the LLM write the deck” architecture before you start.",
          "Two more constraints shaped the system: research data is confidential, so inference had to stay on the machine; and a local model will sometimes be slow, wrong, or simply down — so the product had to keep working without it.",
        ],
      },
      {
        heading: "Thinking model",
        lead: "Decide what the model may own before deciding what it can do.",
        body: [
          "The first design artefact wasn't a screen — it was a boundary. Everything the model may own sits on one side: selecting which findings matter, narrating them, converting prose into a report shape. Everything it may never touch sits on the other: the numbers, the slide structure, the styling, and whether the product works at all.",
          "Between the two sits a validation gate — typed contracts and literal-value checks — and output that fails it is discarded, not repaired. Once that boundary existed, most decisions stopped being debates: every guardrail, fallback and edge state in the product is the same boundary applied to another surface.",
        ],
        image: {
          src: "/uxproof-diagram-authority.svg",
          caption:
            "[ THINKING MODEL — DIVISION OF AUTHORITY: WHAT THE MODEL MAY OWN, WHAT CODE MUST ]",
          alt: "Diagram of uxproof's division of authority: the model owns selection and narration on the left, code owns numbers, structure, styling and availability on the right, with a validation gate between them",
        },
      },
      {
        heading: "Approach",
        lead: "Every number grounded, every model step backed by a deterministic fallback.",
        body: [
          "[ Grounding ] Structured uploads are parsed deterministically. Prose documents go through a model conversion with a literal-value guardrail: every numeric field must appear verbatim in the source text or it is dropped, and a report without a grounded score is rejected outright. The same rule polices chat answers and document summaries — any reply whose numbers can't be traced to stored data is discarded in favour of its deterministic template.",
          "[ Fallbacks ] The LLM is an enhancement, never a dependency. Every model step has a deterministic fallback: conversational answers fall back to templated ones, summaries to excerpts, extraction and planning to rule-built equivalents. With the model completely offline, decks still generate.",
          "[ Deliverable ] The output is a fixed eight-slide monochrome PowerPoint template. The model selects and narrates content; deterministic rendering rules own layout, typography and branding. The deck cannot drift, because the model never touches it.",
        ],
        gallery: [
          {
            src: "/uxproof-diagram-guardrail.svg",
            caption: "[ THE GROUNDING GATE — HOW PROSE BECOMES A REPORT, OR DOESN'T ]",
            alt: "Flow diagram of the grounding gate: an uploaded document passes through model conversion, then two gates — each number must appear literally in the source or the field is dropped, and without a grounded SUS score no report is created at all",
          },
          {
            src: "/uxproof-diagram-fallbacks.svg",
            caption: "[ THE FALLBACK LADDER — WHAT EACH MODEL STEP DEGRADES TO ]",
            alt: "Diagram pairing each model step with its deterministic fallback: conversational answers fall back to templates, summaries to excerpts, prose conversion to reference storage, extraction and planning to rule-built equivalents",
          },
        ],
      },
      {
        heading: "Edge states",
        lead: "The unhappy paths are the product.",
        body: [
          "Every failure mode is a designed state, not an error toast. The model being offline is one of them: chat answers fall back to deterministic templates, summaries to excerpts, slide plans to rule-built equivalents — the tool keeps working, quietly. A number that can't be grounded in the source is discarded, never shown.",
          "The same care runs through the quieter corners: an empty workspace gets an upload prompt instead of somebody else's demo data; a restored chat session renders its presentation cards idle rather than re-firing old generations; a document without a verifiable score is kept as reference context instead of becoming a fake report.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          caption:
            "[ PLACEHOLDER — EDGE-STATE FRAMES: MODEL OFFLINE, UNGROUNDED NUMBER, EMPTY WORKSPACE — SWAP FOR UI STATES ]",
          alt: "Placeholder for a set of uxproof edge-state frames: the model-offline fallback, a discarded ungrounded number, and the empty-workspace upload prompt",
        },
      },
      {
        heading: "Interaction quality",
        lead: "Craft you can tab through: labelled, announced, keyboard-complete.",
        body: [
          "The chat surface is fully keyboard-operable. Every icon-only control — upload, send, history, account — carries a real label; focus rings are visible on every interactive element; and hover-revealed actions, like deleting a conversation, also reveal on keyboard focus, so nothing in the product is pointer-only.",
          "State changes are announced, not just painted: toasts are polite live regions, errors are alerts, expandable summaries expose their open state, and the active conversation is marked for assistive tech. Uploads render optimistically, generation cards move through honest idle / working / done / error states, and a restored session never silently re-fires an old generation.",
        ],
      },
      {
        heading: "Design system",
        lead: "Consistency enforced in code, not in a PDF.",
        body: [
          "The deck has a single source of truth: one branding module owns the palette, type and geometry, and one fixed eight-slide structure is enforced at render time. There is no way to ship an off-brand slide, because layout never passes through the model — the plan selects and narrates content, deterministic rules draw it.",
          "The same pattern scales beyond decks: typed content blocks — KPIs, charts, issues, priorities — share one shape across the schema, the pipeline and the renderer, so a new slide element is added as one contract and understood everywhere.",
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
        lead: "Three services, one rule: the model never owns the numbers.",
        body: [
          "Three services with clean seams: a Next.js app that owns chat, uploads and deck rendering; a FastAPI agent service that builds slide plans; and a headless CMS as the single store for reports, sessions and plans. Inference runs on a local model, so research data never leaves the machine.",
          "Deck content comes from a hand-rolled multi-agent sequence — context, extraction, planning. Plain Python, no orchestration framework. Agents exchange typed Pydantic contracts, so malformed model output fails loudly at a validation boundary instead of leaking into a client deck.",
        ],
        image: {
          src: "/uxproof-diagram-architecture.svg",
          caption:
            "[ SYSTEM ARCHITECTURE — THREE SERVICES, TYPED SEAMS, EVERYTHING ON ONE MACHINE ]",
          alt: "Diagram of the uxproof architecture: a React browser client, the Next.js app with intent routing, grounding gate and deck renderer, connected to a Sanity content store, a FastAPI agent pipeline, and a local Ollama model — all inside a single-machine boundary",
        },
      },
      {
        heading: "AI-assisted workflow",
        lead: "AI drafts fast; the quality bar is codified, not remembered.",
        body: [
          "uxproof is built with an agentic AI pair, and the division of labour is deliberate: generation is fast at scaffolding — components, refactors, test plumbing — while I take over where judgement lives: interaction details, edge states, accessibility passes, visual polish.",
          "The review bar doesn't live in my head — it lives in the repo. A project brief encodes the invariants every generated change is checked against: numbers are never model-authored, every model step has a fallback, the deck template has one source of truth, pages stay server components while interaction lives in client components. A small fleet of custom agents runs the ceremony around the code — a documentarian that regenerates the architecture document from what's actually on disk, an auditor that reviews changes against the invariants, a tester that writes versioned readiness reports. Drift gets caught by process, not memory.",
          "One concrete example of what that looks like in practice: generated output kept nudging the deck renderer toward one-off spacing values and accent colours — each instance easy to fix, none of them staying fixed. The answer wasn't another review comment; it was codifying the rule into the brief and the branding module, so every future draft — mine or the model's — is checked against it automatically.",
        ],
      },
      {
        heading: "Outcome",
        lead: "From an evening of manual assembly to a sentence in a chat box.",
        body: [
          "Ask for a period, a comparison, or a year in review, and a client-ready deck renders on demand — same structure, same branding, every time.",
          "Every number in every deck is traceable: read from a stored report, or validated to appear literally in an uploaded document. And because inference runs locally, research data never leaves the machine.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          caption: "[ uxproof — chat home: upload, quick actions, generation prompts ]",
          alt: "uxproof running on a laptop — a chat-first home screen with a file-upload button, chat history, and quick-action prompts for generating presentations",
        },
      },
      {
        heading: "What I'd tell the next team",
        lead: "Guardrails that discard beat prompts that plead.",
        body: [
          "Asking a model to be accurate is hope; validating its output against the source is engineering. Decide early what the model is allowed to control, and design the fallback paths first: the happy path takes care of itself, but trust is won on the other paths.",
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

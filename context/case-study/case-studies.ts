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
  /**
   * Render at the image's own aspect, uncropped — the treatment SVG diagrams
   * get by default. Without it a raster is cropped to the frame's ratio, which
   * cuts the edges off a shot that has to be seen whole.
   */
  fit?: "contain";
}

export interface CaseSection {
  /** Short section name; keys the block. */
  heading: string;
  /**
   * The section's key message, shown as the big display text. Falls back to
   * the heading.
   */
  lead?: string;
  body: string[];
  /** Optional full-width frame rendered after the section's copy. */
  image?: CaseImage;
  /** Optional pair of supporting frames rendered inside the section. */
  gallery?: CaseImage[];
  /**
   * Optional run of frames stacked one per row, each at full width and its
   * own aspect. Use for specification pages that have to be read rather
   * than glanced at — a `gallery` would halve them.
   */
  stack?: CaseImage[];
}

export interface CaseStudy {
  slug: string;
  index: string; // "01", "02"...
  title: string; // sentence case, display font
  tag: string; // short category label, shown in mono caps
  year: string;
  status:
    "In production" | "Built" | "Prototype" | "In progress" | "Prototype-Built";
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
    tag: "AI product / UX engineering / Design systems",
    year: "2026",
    status: "Prototype-Built",
    summary:
      "[ Uxproof is a " +
      "self-initiated AI product that turns UX research into " +
      "presentation-ready decks — designed, architected and built end to " +
      "end in React and TypeScript, with deterministic UX and engineering " +
      "boundaries around the model. ]",
    card: {
      problem:
        "Turning a quarter of research into a client deck takes days. An " +
        "AI that presents research to a client also cannot make up a " +
        "single number or add slides simply to look thorough.",
      approach:
        "I designed the interaction model, built the product end to end in " +
        "React and TypeScript, and created the design system behind it. " +
        "The model interprets and narrates; deterministic code owns the " +
        "facts, structure, accessibility and visual consistency.",
      result:
        "A working research-to-presentation workflow with traceable " +
        "numbers, explicit edge states, deterministic fallbacks and a " +
        "design system that turns UX quality into reusable rules.",
    },
    ledger: [
      {
        k: "[ Project ]",
        v: "uxproof — self-initiated concept build for my own research ",
      },
      {
        k: "[ Role ]",
        v:
          "Solo build — product concept, UX, architecture, frontend, AI " +
          "workflow and deck renderer",
      },
      {
        k: "[ Stack ]",
        v:
          "Next.js · React 19 · TypeScript · Zustand · FastAPI · Pydantic · " +
          "Sanity · Ollama (local LLM) · pptxgenjs",
      },
      {
        k: "[ Constraints ]",
        v: "Local-only inference",
      },
      {
        k: "[ Provenance ]",
        v:
          "A concept, not a commercial product — its patterns are informed " +
          "by my experience working on production AI systems",
      },
      { k: "[ Status ]", v: "Working concept — built end-to-end, 2026" },
    ],
    sections: [
      {
        heading: "Context",
        lead: "Upload the research, talk to it, get the deck.",
        body: [
          "Quarterly UX research kept ending its life in slide decks. " +
            "Every cycle meant pulling SUS scores, KPIs and findings out of " +
            "files by hand, rebuilding the same slide structures, and hoping " +
            "the numbers survived the copy-paste. I treated that recurring " +
            "workflow as the starting point for the product: understand what " +
            "researchers repeatedly need to find, decide and communicate, " +
            "then design the interaction around those behaviours.",
          "The starting point was research practice rather than a feature " +
            "brief. I used the workflow from my own quarterly research as " +
            "the initial product context, identifying recurring tasks, " +
            "failure modes, information needs and trust requirements before " +
            "defining the interface. That led to a domain-specific " +
            "information model rather than a generic AI chat: the product " +
            "works with research periods, SUS scores, task results, findings " +
            "and recommendations because those are the units researchers " +
            "actually need to analyse, compare and communicate.",
          "A note on what this is: a concept build, not a production " +
            "product. It runs end-to-end on my own research practice — real " +
            "uploads, real decks — but it exists to demonstrate an " +
            "architecture, not to ship to customers. Its patterns are " +
            "informed by my experience working on production AI systems.",
        ],
        image: {
          src: "/uxproof-mockup.jpg",
          fit: "contain",
          caption:
            "[ THE TOOL ITSELF — THE CHAT HOME EVERY REQUEST STARTS FROM ]",
          alt:
            "uxproof open on a laptop: the chat home with the welcome " +
            "headline, a row of quick actions and the composer at the bottom",
        },
      },
      {
        heading: "Workflow",
        lead:
          "The information architecture follows the researcher's workflow, " +
          "not the model's capabilities.",
        body: [
          "The workflow is chat-first and upload-grounded, but the " +
            "architecture underneath it is structured around the " +
            "researcher's mental model. Research files become evidence; " +
            "evidence becomes reports and periods; reports become " +
            "conversation context; conversation becomes analysis and, " +
            "eventually, a presentation. Files go in through the chat's plus " +
            "button; structured data — quarter, year, SUS score — is parsed " +
            "into per-user reports, and prose documents are converted by a " +
            "local model under a strict guardrail. From there it's plain " +
            "language: “Analyse Q3 2025”, “Compare Q2 vs Q3”, “Generate the " +
            "2025 presentation”.",
          "The conversation itself is designed, not just parsed. A bare " +
            "“yes” after the tool offers a presentation becomes a real " +
            "generation request; a follow-up question with no period named " +
            "inherits the last one discussed; a workspace with no data gets " +
            "an upload prompt instead of machinery running on nothing.",
        ],
        image: {
          src: "/uxproof-app-summary.jpg",
          fit: "contain",
          caption:
            "[ FILE BECOMES EVIDENCE, EVIDENCE BECOMES A FILED PERIOD — " +
            "AND EVERY FIGURE KEEPS THE PAGE IT CAME FROM ]",
          alt:
            "An AI summary of an uploaded research PDF in the uxproof chat: " +
            "metrics, key findings and recommendations, each claim followed " +
            "by the page it was read from, and a closing line saying the " +
            "research data was extracted and filed under Q3 2026",
        },
      },
      {
        heading: "Problem",
        lead:
          "An AI presenting research to a client has to be right every time, " +
          "not most of the time.",
        body: [
          "That one requirement disqualifies the default “let the LLM " +
            "write the deck” architecture before you start.",
          "Two more constraints shaped the system: research data is " +
            "confidential, so inference had to stay on the machine; and a " +
            "local model will sometimes be slow, wrong, or simply down — so " +
            "the product had to keep working without it.",
        ],
      },
      {
        heading: "Thinking model",
        lead:
          "Define the boundary between AI interpretation and product-owned " +
          "behaviour.",
        body: [
          "The first design artefact wasn't a screen — it was a boundary. " +
            "Everything the model may own sits on one side: selecting which " +
            "findings matter, narrating them, converting prose into a report " +
            "shape. Everything it may never touch sits on the other: the " +
            "numbers, the slide structure, the styling, and whether the " +
            "product works at all.",
          "Between the two sits a validation gate — typed contracts and " +
            "literal-value checks — and output that fails it is discarded, " +
            "not repaired. Once that boundary existed, it became the " +
            "system-level decision behind the rest of the experience: " +
            "guardrails, fallbacks, edge states, accessibility behaviour and " +
            "rendering rules all reinforce the same division of " +
            "responsibility.",
        ],
        image: {
          src: "/uxproof-diagram-authority.svg",
          caption:
            "[ THINKING MODEL — DIVISION OF AUTHORITY: WHAT THE MODEL MAY " +
            "OWN, WHAT CODE MUST ]",
          alt:
            "Diagram of uxproof's division of authority: the model owns " +
            "selection and narration on the left, code owns numbers, " +
            "structure, styling and availability on the right, with a " +
            "validation gate between them",
        },
      },
      {
        heading: "Approach",
        lead:
          "Every number is grounded, and every model step has a " +
          "deterministic fallback.",
        body: [
          "[ Grounding ] Structured uploads are parsed deterministically. " +
            "Prose documents go through a model conversion with a " +
            "literal-value guardrail: every numeric field must appear " +
            "verbatim in the source text or it is dropped, and a report " +
            "without a grounded score is rejected outright. The same rule " +
            "polices chat answers and document summaries — any reply whose " +
            "numbers can't be traced to stored data is discarded in favour " +
            "of its deterministic template.",
          "[ Fallbacks ] The LLM is an enhancement, never a dependency. " +
            "Every model step has a deterministic fallback: conversational " +
            "answers fall back to templated ones, summaries to excerpts, " +
            "extraction and planning to rule-built equivalents. With the " +
            "model completely offline, decks still generate.",
          "[ Deliverable ] The output is a PowerPoint deck drawn from a " +
            "library of thirteen slide types, and its length follows the " +
            "evidence — a slide appears only when the figures behind it " +
            "exist. The model selects and narrates content; deterministic " +
            "rendering rules own layout, typography and branding. The deck " +
            "cannot drift, because the model never touches it.",
        ],
        gallery: [
          {
            src: "/uxproof-diagram-guardrail.svg",
            caption:
              "[ THE GROUNDING GATE — HOW PROSE BECOMES A REPORT, OR DOESN'T ]",
            alt:
              "Flow diagram of the grounding gate: an uploaded document " +
              "passes through model conversion, then two gates — each number " +
              "must appear literally in the source or the field is dropped, " +
              "and without a grounded SUS score no report is created at all",
          },
          {
            src: "/uxproof-diagram-fallbacks.svg",
            caption:
              "[ THE FALLBACK LADDER — WHAT EACH MODEL STEP DEGRADES TO ]",
            alt:
              "Diagram pairing each model step with its deterministic " +
              "fallback: conversational answers fall back to templates, " +
              "summaries to excerpts, prose conversion to reference storage, " +
              "extraction and planning to rule-built equivalents",
          },
        ],
        image: {
          src: "/uxproof-app-pipeline.jpg",
          fit: "contain",
          caption:
            "[ THE AGENT SEQUENCE, NAMED AS IT RUNS — CONTEXT, EXTRACTION, " +
            "PLANNING, RENDER ]",
          alt:
            "The uxproof chat on a tablet during deck generation: a " +
            "presentation card with an elapsed counter, above a list of " +
            "named pipeline stages where finished steps carry a check and " +
            "the running step is marked with a violet dot",
        },
      },
      {
        heading: "Architecture",
        lead:
          "Clean ownership boundaries, one UX principle: the model " +
          "interprets; deterministic code owns product behaviour.",
        body: [
          "The architecture is split into explicit ownership boundaries: " +
            "the Next.js app owns the interaction layer, uploads and deck " +
            "rendering; a FastAPI service owns slide-plan generation; a " +
            "headless CMS stores reports, sessions and plans; and local " +
            "model inference is confined to explicit AI boundaries. " +
            "Deterministic code owns the facts, validation, structure and " +
            "rendering.",
          "Deck content comes from a hand-rolled multi-agent sequence — " +
            "context, extraction, planning. Plain Python, no orchestration " +
            "framework. Agents exchange typed Pydantic contracts, so " +
            "malformed model output fails loudly at a validation boundary " +
            "instead of leaking into a client deck.",
        ],
      },
      {
        heading: "Edge states",
        lead: "The unhappy paths are the product.",
        body: [
          "Every failure mode is a designed state, not an error toast. The " +
            "model being offline is one of them: chat answers fall back to " +
            "deterministic templates, summaries to excerpts, slide plans to " +
            "rule-built equivalents — the tool keeps working, quietly. A " +
            "number that can't be grounded in the source is discarded, never " +
            "shown.",
          "The same care runs through the quieter corners: an empty " +
            "workspace gets an upload prompt instead of somebody else's demo " +
            "data; a restored chat session renders its presentation cards " +
            "idle rather than re-firing old generations; a document without " +
            "a verifiable score is kept as reference context instead of " +
            "becoming a fake report.",
        ],
                stack: [
          {
            src: "/uxproof-diagram-contracts.svg",
            caption:
              "[ ONE CONTRACT, THREE LANGUAGES — THE SCHEMA, THE APP AND THE " +
              "PIPELINE SHARE A SHAPE ]",
            alt:
              "Diagram showing one content-block contract mirrored in three " +
              "places: the Sanity content schema, the TypeScript types and " +
              "GROQ projections in the app, and the Pydantic models in the " +
              "agent pipeline",
          },
          {
            src: "/uxproof-diagram-architecture.svg",
            caption:
              "[ SYSTEM ARCHITECTURE — EXPLICIT OWNERSHIP BOUNDARIES, TYPED " +
              "CONTRACTS, EVERYTHING ON ONE MACHINE ]",
            alt:
              "Diagram of the uxproof architecture: a React browser client, " +
              "the Next.js app with intent routing, grounding gate and deck " +
              "renderer, connected to a Sanity content store, a FastAPI " +
              "agent pipeline, and a local Ollama model — all inside a " +
              "single-machine boundary",
          },
        ],
      },
      {
        heading: "Design system",
        lead:
          "The design system defines interaction boundaries as well as " +
          "visual styles.",
        body: [
          "The application's system is sixteen pages and a " +
            "machine-readable token file. The most useful page in it is not " +
            "about styling: it is a table of the six places a control is " +
            "allowed to live — top bar, view header, row or card, composer, " +
            "anchored panel, centred dialog — and what each one may hold. " +
            "The rule underneath is what does the work: a control that fits " +
            "none of those six homes means the interaction is wrong, not " +
            "that a seventh surface is needed. That is why the product has " +
            "never grown a toolbar, a context menu, a filter bar or a " +
            "settings page.",
          "The rest of it works the same way — rules rather than swatches. " +
            "Type is two families and eight steps, each tied to a job, with " +
            "an explicit instruction not to add a ninth. Emphasis is a " +
            "budget: one filled button per view, navigation whose fill " +
            "doubles as state, destructive actions kept quiet until the " +
            "confirmation step. The three non-content states are specified " +
            "rather than improvised, and so is the destructive flow that " +
            "names the research periods a deletion will take with it.",
          "The generated deck has a system of its own, deliberately " +
            "separate from this one. They share two typefaces and nothing " +
            "else, and neither system's tokens may appear in the other.",
        ],
        stack: [
          {
            src: "/uxproof-ds-typography.svg",
            caption:
              "[ TWO FAMILIES, EIGHT SIZES — AND A RULE AGAINST ADDING A " +
              "NINTH ]",
            alt:
              "Design-system page: the two type families with their weights, " +
              "a tracking and leading table, each type role shown at its " +
              "real size beside its specification, and the eight-step scale " +
              "in use",
          },
          {
            src: "/uxproof-ds-actions.svg",
            caption:
              "[ ONE FILLED BUTTON PER VIEW — VARIANTS, STATES, AND THE " +
              "RULES THAT GOVERN THEM ]",
            alt:
              "Design-system page: the button variant and state matrices, " +
              "the size scale, and the applied action rules covering " +
              "navigation, destructive actions and hover-revealed row " +
              "actions",
          },
          {
            src: "/uxproof-ds-states.svg",
            caption:
              "[ THE THREE NON-CONTENT STATES, AND A DESTRUCTIVE FLOW THAT " +
              "NAMES WHAT ELSE GOES ]",
            alt:
              "Design-system page: the page-header pattern, a file row, " +
              "metric tiles, the loading, empty and error states side by " +
              "side, and the four-step destructive flow — offer, name the " +
              "cost, commit, report",
          },
          {
            src: "/uxproof-ds-conversation.svg",
            caption:
              "[ A LADDER, NOT A SPINNER — THE ASSISTANT SURFACE AND THE " +
              "FOUR STATES OF THE PRESENTATION CARD ]",
            alt:
              "Design-system page: message rows with the assistant mark and " +
              "an asymmetric bubble radius, a named step ladder showing " +
              "pipeline progress, and the presentation card with its slide " +
              "strip and download action",
          },
                    {
            src: "/uxproof-ds-chrome.svg",
            caption:
              "[ WHERE A CONTROL BELONGS — SIX SURFACES, AND WHAT EACH IS " +
              "ALLOWED TO HOLD ]",
            alt:
              "Design-system page: the top bar, history drawer, composer and " +
              "anchored panels, with a table listing six surfaces — top bar, " +
              "view header, row or card, composer, anchored panel, centred " +
              "dialog — and what lives in each",
          },
        ],
      },
      {
        heading: "Interaction quality",
        lead:
          "Accessibility is part of the interaction model, not a final " +
          "polish pass.",
        body: [
          "The chat surface is keyboard-operable throughout the primary " +
            "interaction flows. Every icon-only control — upload, send, " +
            "history, account — carries a real label; focus rings are " +
            "visible on every interactive element; and hover-revealed " +
            "actions, like deleting a conversation, also reveal on keyboard " +
            "focus, so nothing in the product is pointer-only.",
          "State changes are announced, not just painted: toasts are " +
            "polite live regions, errors are alerts, expandable summaries " +
            "expose their open state, and the active conversation is marked " +
            "for assistive tech. Uploads render optimistically, generation " +
            "cards move through honest idle / working / done / error states, " +
            "and a restored session never silently re-fires an old " +
            "generation.",
        ],
      },
      {
        heading: "Colour and contrast",
        lead: "Measured against the shipped tokens, not assumed.",
        body: [
          "Every text pair is calculated from the values actually shipping " +
            "and listed with its ratio, passes and failures alike. Two " +
            "colours moved because of it: muted text was darkened until it " +
            "cleared 4.5:1 on every surface it lands on, and the dark-mode " +
            "error pair — 2.66:1, which made form errors nearly invisible — " +
            "was inverted. The page names the weakest point out loud, and " +
            "the two hues still under the bar are icon-only by rule.",
        ],
        image: {
          src: "/uxproof-ds-contrast.svg",
          caption:
            "[ MEASURED CONTRAST — EVERY PAIR COMPUTED FROM THE SHIPPED " +
            "TOKENS, AND THE RULES THAT FOLLOW FROM IT ]",
          alt:
            "Design-system page: the dark theme palette, a measured contrast " +
            "table listing each colour pair with its ratio and whether it " +
            "passes, and three rules derived from the measurements",
        },
      },
      {
        heading: "Responsive behaviour",
        lead: "Responsive work is a series of decisions about what to lose.",
        body: [
          "The file row is the clearest one. It reads left to right as " +
            "identity, facts, evidence, actions, disclosure — and below the " +
            "sm breakpoint the period badges are what goes. They are the " +
            "row's evidence of what that file actually contributed, which " +
            "matters, but the filename and the two actions are what the row " +
            "is *for*. Nothing wraps to a second line; the row keeps its " +
            "shape and loses a column.",
          "The presentation card goes the other way deliberately. Its " +
            "slide strip stays four across at every width instead of " +
            "reflowing to two, and the thumbnails shrink instead. The strip " +
            "is a proportional map of the deck — how many slides, which ones " +
            "carry the violet — so reflowing it would change what it " +
            "communicates rather than just how it fits.",
          "The conversation is capped rather than restructured: the " +
            "message column stops at 48rem and centres, and no bubble " +
            "exceeds 85% of it, so line length stays readable on a wide " +
            "monitor and the same rule simply fills a tablet. The history " +
            "drawer is an overlay with a scrim at every width, never a " +
            "persistent column, so opening it never reflows the conversation " +
            "behind it. The presentations grid is the one place that " +
            "genuinely re-columns — one up, two at md, three at lg — because " +
            "cards are the only content here that tolerates it.",
        ],
        image: {
          src: "/uxproof-app-strip.jpg", // CHANGE THIS IMAGE INTO RELEVANT ONE
          fit: "contain",
          caption:
            "[ THE SLIDE STRIP STAYS FOUR ACROSS — THE THUMBNAILS SHRINK, " +
            "THE SHAPE OF THE DECK SURVIVES ]",
          alt:
            "The uxproof chat at tablet width: a finished presentation card " +
            "whose slide strip keeps four thumbnails per row, with the " +
            "violet cover and findings-summary slides visible among the " +
            "greyed ones",
        },
      },
      {
        heading: "The deck's design system",
        lead:
          "The slides's design system is separate from the application's, and " +
          "stricter.",
        body: [
          "The deck is built on four masters — content, cover, section " +
            "divider, and one violet statement poster used once so the " +
            "section summary reads as a poster rather than another table. It " +
            "has its own palette: a ground that is never pure white, one " +
            "ink, a violet accent with deep and pale variants, and four flat " +
            "ink tints that do the structural work of rules, hairlines and " +
            "chart tracks.",
          "Its rules are absolute rather than advisory. Corner radius is " +
            "zero on every rectangle, chip and card; no shadows, no " +
            "gradients. Charts are drawn as shapes, never as live chart " +
            "objects that would drag in their own fonts and colour theme. " +
            "Text is flush left everywhere except the footer credit and " +
            "chart axis labels. And at most one figure per slide is violet — " +
            "violet marks the problem, so if everything is violet nothing " +
            "is.",
          "The template is a library, not a running order: a short readout " +
            "is a subset, and the instruction is to delete the rest rather " +
            "than rush them. That is the same rule the renderer enforces in " +
            "code, where a slide is emitted only when the figures behind it " +
            "exist.",
        ],
        stack: [
          {
            src: "/uxproof-deckspec-masters.svg",
            caption:
              "[ FOUR MASTERS — CONTENT, COVER, SECTION DIVIDER, AND THE ONE " +
              "VIOLET STATEMENT POSTER ]",
            alt:
              "A page from the deck build spec showing the four slide " +
              "masters drawn to scale: the content master with its eyebrow " +
              "row and data field, the cover with its violet plate over a " +
              "full-bleed photograph, the section divider with its ghost " +
              "numeral, and the violet statement poster",
          },
           {
          src: "/uxproof-app-strip.jpg", // CHANGE THIS IMAGE INTO RELEVANT ONE
          fit: "contain",
          caption:
            "[ THE SLIDE STRIP STAYS FOUR ACROSS — THE THUMBNAILS SHRINK, " +
            "THE SHAPE OF THE DECK SURVIVES ]",
          alt:
            "The uxproof chat at tablet width: a finished presentation card " +
            "whose slide strip keeps four thumbnails per row, with the " +
            "violet cover and findings-summary slides visible among the " +
            "greyed ones",
        },

        ],
      },
      {
        heading: "AI-assisted workflow",
        lead: "AI generates quickly. I own the UX quality bar.",
        body: [
          "uxproof was developed with an agentic AI workflow, but the " +
            "division of responsibility is deliberate: AI accelerates " +
            "implementation — scaffolding components, proposing refactors, " +
            "generating test plumbing and exploring alternatives — while I " +
            "own the decisions that require UX and engineering judgement: " +
            "interaction behaviour, information architecture, edge states, " +
            "accessibility, visual quality and system consistency.",
          "The review bar doesn't live in my head — it lives in the repo. " +
            "A project brief encodes the invariants every generated change " +
            "is checked against: numbers are never model-authored, every " +
            "model step has a fallback, the deck template has one source of " +
            "truth, and pages stay server components while interaction lives " +
            "in client components. An auditor reviews changes against those " +
            "invariants; tests generate versioned readiness reports; " +
            "documentation is regenerated from the implementation so the " +
            "system does not drift away from what was actually built.",
          "The important shift is from reviewing AI output one change at a " +
            "time to designing a system that constrains it. When generated " +
            "output repeatedly introduced one-off spacing values and accent " +
            "colours, I did not keep correcting the same problem manually. I " +
            "encoded the rule into the project brief and branding module so " +
            "future output — whether generated by AI or written by me — is " +
            "evaluated against the same design constraints.",
          "AI generates → UX engineering evaluates → the design system " +
            "constrains → tests verify. That loop lets me move faster " +
            "without lowering the quality bar.",
        ],
      },
      {
        heading: "Outcome",
        lead:
          "A complete working prototype — designed, engineered and validated " +
          "end to end.",
        body: [
          "A working research-to-presentation workflow: chat-first " +
            "interaction, evidence-driven deck generation, explicit loading " +
            "and error states, a reusable design system, measured " +
            "accessibility decisions and deterministic fallbacks when AI is " +
            "unavailable. The prototype connects product thinking, UX " +
            "research practice, interaction design, React engineering and " +
            "AI-assisted implementation in one system.",
          "I have not measured adoption, usage or time saved, so I don't " +
            "present invented outcome metrics. What I can demonstrate is the " +
            "complete experience — from interaction model and design system " +
            "through React implementation, AI behaviour, validation and " +
            "presentation output.",
        ],
        image: {
          src: "/uxproof-app-summary.jpg",
          fit: "contain",
          caption:
            "[ THE DECK, READY TO DOWNLOAD — THE STRIP SHOWS WHAT THIS " +
            "DATA ACTUALLY PRODUCED ]",
          alt:
            "The uxproof chat on a tablet with a finished presentation card: " +
            "a strip of slide thumbnails labelled cover, contents, executive " +
            "summary, study at a glance, section, finding, findings summary " +
            "and recommendations, above a download button",
        },
      },
      {
        heading: "What I'd tell the next team",
        lead: "Design the boundary before you design the feature.",
        body: [
          "Quality cannot depend on someone remembering to check the same " +
            "thing repeatedly. Decide what the model owns, what the product " +
            "owns and what the user needs to understand, then encode those " +
            "decisions in the interaction model, information architecture, " +
            "design system, types, validation and tests. That turns UX " +
            "quality from an individual review task into a property of the " +
            "system — and makes AI-assisted development faster without " +
            "making the product less deliberate.",
        ],
      },
    ],
    hero: {
      src: "/uxproof-deck-in-room.jpg",
      caption:
        "[ THE DELIVERABLE, IN THE ROOM IT'S BUILT FOR — THE FINDINGS " +
        "POSTER, THE DECK'S ONE VIOLET STATEMENT SLIDE ]",
      alt:
        "A generated uxproof deck on a meeting-room screen in front of a " +
        "seated audience: the violet findings-summary slide, a large figure " +
        "beside a numbered list of four findings",
    },
  },
];

export const getCaseStudy = (slug: string): CaseStudy | undefined =>
  caseStudies.find((c) => c.slug === slug);

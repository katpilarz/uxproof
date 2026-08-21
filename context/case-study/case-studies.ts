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
    tag: "AI product / UX engineering / Design systems",
    year: "2026",
    status: "Built",
    summary:
      "[ An AI that turns the UX research you upload into a client-ready deck. I built it so it can't invent a number, pad the deck or ship an off-brand slide — not because it's told not to, but because there's no path through the code that lets it. ]",
    card: {
      problem:
        "Turning a quarter of research into a client deck takes days. And an AI that presents research to a client can't make up a single number, or add slides just to look thorough.",
      approach:
        "I designed how it behaves, built it end to end in React and TypeScript, and wrote the design system behind it. The model picks and phrases. The code owns the facts and the structure.",
      result:
        "Decks as long as the evidence and no longer, every number traceable to a file the user uploaded, and a design system I audited in public — six fixes shipped, two problems left open.",
    },
    ledger: [
      {
        k: "[ Project ]",
        v: "uxproof — self-initiated build, made to show how I work rather than to ship",
      },
      {
        k: "[ Behind it ]",
        v: "Practice carried over from building GenAI products in a product team, and from postgraduate study in AI project management",
      },
      {
        k: "[ Role ]",
        v: "Solo, end to end — interaction model, UX, React/TypeScript frontend, design system, AI behaviour, deck renderer",
      },
      {
        k: "[ Stack ]",
        v: "Next.js 16 · React 19 · TypeScript · Tailwind 4 · Zustand · FastAPI · Pydantic · Sanity · Ollama (local LLM) · pptxgenjs",
      },
      {
        k: "[ Design system ]",
        v: "16-page specification + machine-readable tokens — v1.0 audit, v1.1 fixes: 8 findings, 6 closed in code, 2 left open",
      },
      {
        k: "[ Validation ]",
        v: "120 unit tests across 6 suites on the trust boundary and the deck gate — no component, end-to-end or automated accessibility tests",
      },
      {
        k: "[ Constraints ]",
        v: "Local-only inference — research data never leaves the machine; no orchestration frameworks",
      },
      { k: "[ Status ]", v: "Working concept — built end to end, 2026" },
    ],
    sections: [
      {
        heading: "Context",
        lead: "Upload your research, talk to it, get the deck.",
        body: [
          "Every quarter, the same job. Dig SUS scores, task results and findings out of a pile of files, rebuild the same slides, then check nothing got mangled on the way. uxproof is my answer to that: you upload the research, ask questions in plain language, and the deck is built from what those files actually say.",
          "I built it on my own, which is why I can show it. It isn't a blank-sheet side project though. Where the boundary around the model sits, which states the interface refuses to skip, what gets written down as a rule instead of remembered — all of that comes out of building GenAI products in a product team, and out of a postgraduate course in AI project management. Most of that work sits behind an NDA. This is the same way of working, on something I can put in front of people.",
          "So treat it as a summary of how I think and how I build. I did all of it here — how the product behaves, the React and TypeScript front end, the design system, the AI behaviour and the PowerPoint renderer. It runs on one machine, and the research never leaves it.",
          "There's no shared demo dataset. A new account starts empty and asks you to upload something, rather than showing you someone else's numbers.",
        ],
        image: {
          src: "/uxproof-app-welcome.jpg",
          caption:
            "[ AN EMPTY WORKSPACE ASKS FOR AN UPLOAD — IT NEVER OPENS ON SOMEONE ELSE'S NUMBERS ]",
          alt: "The uxproof welcome screen on a tablet: a headline reading UX Evidence — Perfectly Presented, a short instruction to upload quarterly reports, and a row of quick actions above the chat composer",
        },
      },
      {
        heading: "The UX problem",
        lead: "An AI presenting research to a client has to be right every time, not most of the time.",
        body: [
          "On the surface it's simple: upload, ask, get an answer, generate the deck. All the difficulty sits underneath. A model that's right nine times out of ten is a fine assistant and a useless reporting tool, because the tenth deck is the one already on screen in front of the client.",
          "That's a design problem before it's an engineering one, and it gave me three rules. People should ask in their own words instead of learning an AI workflow. The interface has to be honest about what it knows and what it's doing. And the whole thing has to keep working when the model is slow, wrong, or switched off.",
          "Checking the output afterwards was never going to hold. That's just me remembering to check, every time, forever.",
        ],
      },
      {
        heading: "Key insight",
        lead: "If quality depends on someone remembering, it isn't built in yet.",
        body: [
          "The decision that shaped everything else was to stop asking the model to behave and make the bad output impossible instead. The model can pick findings, write the narration, turn a document into a structured report, and work out what you're asking for. It can't supply a number, decide how long the deck is, choose a colour, or decide whether something is safe to do.",
          "Between those two lists there's a gate, not a guideline. If the model reports a number, that number has to appear word for word in the uploaded document, or the field is dropped. Nothing is repaired and nothing is guessed. With no grounded score at all, no report is created — the file just stays available as background reading.",
          "I made it deliberately strict. A number the document phrases differently gets dropped even though it's genuinely there. A missing field is annoying; an invented one ends the trust.",
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
        heading: "Interaction model",
        lead: "You type normally. The conversation is still designed.",
        body: [
          "It's chat-first, and grounded in what you uploaded: “Analyse Q3 2025”, “Compare Q2 with Q3”, “Generate the 2025 presentation”. Underneath, that resolves into structured actions.",
          "The conversation has real rules. A bare “yes” after the assistant offers a deck becomes the actual request — but only when the message before it was that offer. A follow-up that names no period reuses the last one. Generation only starts on its own for a message that has just arrived, so reopening an old chat never quietly re-runs work you already did.",
          "Waiting is designed, not hidden. Building a deck can take more than a minute, so progress is a named list of pipeline stages instead of a spinner: each step has its own shape and weight, and a real duration once it finishes. A wait that long owes you a reason.",
          "Quotes get checked too. When the assistant cites a document, the quote is located in the source and the citation rewritten to where it actually appears — or dropped, if those words aren't there.",
        ],
        image: {
          src: "/uxproof-ds-conversation.svg",
          caption:
            "[ A LADDER, NOT A SPINNER — THE ASSISTANT SURFACE AND THE FOUR STATES OF THE PRESENTATION CARD ]",
          alt: "Design-system page: message rows with the assistant mark and an asymmetric bubble radius, a named step ladder showing pipeline progress, and the presentation card with its slide strip and download action",
        },
      },
      {
        heading: "The deck",
        lead: "The deck is as long as the evidence, and no longer.",
        body: [
          "The deck isn't a fixed template. It's a library of thirteen slide types — cover, contents, executive summary, study at a glance, section dividers, findings, the findings poster, trend, task performance, SUS by participant, indicators, recommendations, appendix — and which ones appear depends entirely on the data.",
          "A slide only shows up if the numbers behind it exist. Two tasks make a comparison worth a slide; one is a fact that's already on the glance slide. Three participants make a distribution worth plotting; two don't. The violet summary poster waits until there are several findings to collect, because with one it would just repeat the slide before it. Nothing is ever padded to reach a slide count.",
          "There's a ceiling above that, because the slide plan isn't evidence. Ask about a period whose report recorded no issues and the planning agent still hands back finding blocks — and a renderer that trusted it would build a whole Findings section out of material the research never contained. So the deck is cut back to what the source report actually recorded, and the section goes with it.",
          "Same data in, same deck out. The model still chooses and phrases what goes on a slide. It never decides the shape of the deck, and it can't ship an off-brand one — every colour, typeface, size and margin comes from a single template file.",
        ],
        image: {
          src: "/uxproof-deck-system.jpg",
          caption:
            "[ ONE SYSTEM, THIRTEEN SLIDE TYPES — ONE GROUND, ONE VIOLET ACCENT, FLUSH-LEFT TYPE, CHARTS DRAWN AS RECTANGLES · FICTIONAL DEMO DATA ]",
          alt: "Around twenty generated deck slides seen at an angle in an isometric grid — covers, findings, charts and section dividers — all sharing one background colour, one violet accent and flush-left typography",
        },
      },
      {
        heading: "Edge states",
        lead: "The unhappy paths are the product.",
        body: [
          "There are exactly three non-content states, and they're specified rather than improvised. Loading is a spinner next to a sentence naming what's loading — never a skeleton, never a bare spinner. Empty is a muted icon, a plain sentence, one line of instruction and a button pointing at the fix; it never fakes content. Error is a tinted block saying what broke in one sentence, plus a retry where retrying is possible.",
          "The metric tiles follow the same rule: while loading, a tile shows a dash, never a zero. A zero is a measurement, and the app doesn't report measurements it doesn't have.",
          "Deleting is the only multi-step interaction in the product, and the step that matters is the description. Deleting a file also deletes the research periods that only that file supplied, so the dialog lists those periods and says what will stop working, instead of naming the file alone. Deleting a deck says the opposite: the research is untouched and the deck can be rebuilt. The toast afterwards reports what actually went, not a generic success.",
          "While a delete is running, Escape and the background click are both disabled. A half-finished irreversible action isn't something to let someone click away from.",
        ],
        image: {
          src: "/uxproof-ds-states.svg",
          caption:
            "[ THE THREE NON-CONTENT STATES, AND A DESTRUCTIVE FLOW THAT NAMES WHAT ELSE GOES ]",
          alt: "Design-system page: the page-header pattern, a file row, metric tiles, the loading, empty and error states side by side, and the four-step destructive flow — offer, name the cost, commit, report",
        },
      },
      {
        heading: "When the model isn't there",
        lead: "Every AI step has a floor it can fall to.",
        body: [
          "Running the model locally means it's sometimes simply not running. That's a condition to design for, not an outage to apologise for.",
          "Every model step has a plain-code equivalent behind it. Conversational answers fall back to templates, AI summaries to a real excerpt with a word count, document conversion to storing the file as background reading, extraction and planning to rule-based versions. The deck still gets built.",
          "The steps are named while they run, so you can see which stage you're waiting on. What you can't see is which side of the ladder produced it, and that's the point — you shouldn't need to know any of that to keep working. That's the real test of a fallback.",
        ],
        gallery: [
          {
            src: "/uxproof-diagram-fallbacks.svg",
            caption: "[ THE FALLBACK LADDER — WHAT EACH MODEL STEP DEGRADES TO ]",
            alt: "Diagram pairing each model step with its deterministic fallback: conversational answers fall back to templates, summaries to excerpts, prose conversion to reference storage, extraction and planning to rule-built equivalents",
          },
          {
            src: "/uxproof-app-pipeline.jpg",
            caption:
              "[ THE SAME STEPS, NAMED AS THEY RUN — EVERY ONE OF THEM HAS A FLOOR BEHIND IT ]",
            alt: "The uxproof chat on a tablet during deck generation: a presentation card with an elapsed counter, above a list of named pipeline stages where finished steps carry a check and the running step is marked with a violet dot",
          },
        ],
      },
      {
        heading: "Owning the data",
        lead: "An account that can't delete its own data isn't really yours.",
        body: [
          "Accounts are email and password — scrypt from Node's own crypto library, a signed httpOnly cookie, users stored as documents like everything else. No cloud identity provider, because nothing about this product should need the internet.",
          "The decisions worth defending are the UX ones. Signing in never creates an account: a typo in your email is refused, instead of dropping you into an empty workspace that looks exactly like losing your data. “No such account” and “wrong password” return the same message, so the form can't be used to find out who has an account. Changing your password needs the current one even when you're already signed in, so someone on a borrowed laptop can't lock you out. The email can't be edited, because the account id is derived from it — changing it would strand every chat, file and deck the account owns.",
          "Deleting is the same argument from the other end. Every route works out who you are on the server and checks that the document belongs to you before it does anything, so an id from another account gets a 404 and never a deletion. Deleting a file also removes the reports it created, minus any period another upload still covers, and the analysis built on top is removed before the thing it was built from — so a failure halfway through can't leave a plan pointing at a report that's already gone.",
          "This is a concept build on one machine, so the rest of the account perimeter — rate limiting, email verification, password reset — is deliberately out of scope. What is in scope is that the data model can't be talked out of who owns what.",
        ],
      },
      {
        heading: "Accessibility",
        lead: "I measured the palette instead of claiming it.",
        body: [
          "The design system says plainly that the product hasn't been formally tested against a WCAG level — and then publishes the numbers anyway. Every text pair is calculated from the colours actually shipping and listed with its ratio, the passes and the failures alike.",
          "Measuring produced rules, which is the point of measuring. Two colours moved because of it: the muted text was darkened until it cleared 4.5:1 on every surface it lands on, and the dark-mode error pair — 2.66:1, which made form errors nearly invisible — was flipped around. The two hues still under the bar, green and amber, are icon-only by rule, and the one place a text label used them is gone.",
          "It also names the weakest point out loud: muted text on a card, at 5.06:1, is the floor, and it's where most muted text ends up. Don't lighten it, and don't put it on a muted background.",
          "Beyond colour: focus rings live in the component recipes rather than at each call site, so they can't be forgotten. Anything revealed on hover also responds to keyboard focus, so nothing is mouse-only. Reduced motion is respected in both places it has to be, the stylesheet and the animation library. And nothing is signalled by colour alone — the progress list uses shape, weight and strike-through as well.",
          "The gaps are listed as honestly as the ratios. Touch targets sit at 24–32px, streaming replies aren't announced to a screen reader, and there's no skip link past the fixed top bar. There's no automated accessibility testing in the repo either. Naming those is more useful to me than a badge would be.",
        ],
        image: {
          src: "/uxproof-ds-contrast.svg",
          caption:
            "[ MEASURED CONTRAST — EVERY PAIR COMPUTED FROM THE SHIPPED TOKENS, AND THE RULES THAT FOLLOW FROM IT ]",
          alt: "Design-system page: the dark theme palette, a measured contrast table listing each colour pair with its ratio and whether it passes, and three rules derived from the measurements",
        },
      },
      {
        heading: "Design system",
        lead: "Six places a control can live. If it fits none of them, the interaction is wrong.",
        body: [
          "The most useful page in the design system isn't about styling. It's a table of the six places a control is allowed to live — top bar, view header, row or card, composer, anchored panel, centred dialog — and what each one may hold. Identity and navigation in the bar, never anything specific to the current page. Reversible settings in a panel hanging off the avatar. Irreversible decisions in a dialog that interrupts.",
          "The rule underneath is what does the work: if a control doesn't fit one of those six homes, the interaction is wrong — it doesn't mean I need a seventh place to put it. That's why the product has never grown a toolbar, a context menu, a filter bar or a settings page.",
        ],
        image: {
          src: "/uxproof-ds-chrome.svg",
          caption:
            "[ WHERE A CONTROL BELONGS — SIX SURFACES, AND WHAT EACH IS ALLOWED TO HOLD ]",
          alt: "Design-system page: the top bar, history drawer, composer and anchored panels, with a table listing six surfaces — top bar, view header, row or card, composer, anchored panel, centred dialog — and what lives in each",
        },
      },
      {
        heading: "Type",
        lead: "Two families, eight sizes, and nothing in between.",
        body: [
          "One typeface does all the work — Schibsted Grotesk, from the page headline down to buttons and labels. There is no second text face. IBM Plex Mono is kept strictly for machine facts: file extensions, quarter tags, durations, countdown digits, citation chips and uppercase group labels. Never for prose.",
          "The scale is eight steps, from the 30px page headline down to the 10px mono label, and each step is tied to a job rather than a look — page headline, dialog title, card title, body, metadata, context tag. The rule written next to it is “don't add sizes between these”. Eight steps cover the whole product, and a ninth would just be a decision every future screen has to make again.",
          "The other half of it is tracking. Tightening the letter-spacing is what stops the headlines looking like a default Tailwind page, but it belongs to display sizes only. Body text is never tracked tight, and the table says so, so it doesn't come down to whoever is building the screen that day.",
        ],
        image: {
          src: "/uxproof-ds-typography.svg",
          caption:
            "[ TWO FAMILIES, EIGHT SIZES — AND A RULE AGAINST ADDING A NINTH ]",
          alt: "Design-system page: the two type families with their weights, a tracking and leading table, each type role shown at its real size beside its specification, and the eight-step scale in use",
        },
      },
      {
        heading: "The action system",
        lead: "Emphasis is a budget. One filled button per view, and the fill doubles as state.",
        body: [
          "The action rules work the same way — a rule, not a swatch. One filled button per view: the single thing that view exists to do. Navigation is a button whose fill means “you are here” instead of an underline or a rail, so one component does double duty as state. Delete stays a quiet ghost button until you confirm it, and the only solid red button in the product is the confirm inside the dialog — red is earned at the confirmation step, not offered before it.",
          "When I found the primary button had no hover at all — the rule had been written for links, so a real button never responded — I fixed the recipe, and deleted the two one-off overrides that had been papering over it. Fix the recipe, never the call site.",
        ],
        image: {
          src: "/uxproof-ds-actions.svg",
          caption:
            "[ ONE FILLED BUTTON PER VIEW — VARIANTS, STATES, AND THE RULES THAT GOVERN THEM ]",
          alt: "Design-system page: the button variant and state matrices, the size scale, and the applied action rules covering navigation, destructive actions and hover-revealed row actions",
        },
      },
      {
        heading: "Auditing my own system",
        lead: "Eight findings. Six fixed in code, two still open.",
        body: [
          "Writing the design system down turned it into something I could measure the product against, so I did. Version 1.0 listed eight inconsistencies in what had actually shipped. Version 1.1 records what happened to each one.",
          "Three competing reds became one. Eleven dead tokens went, including a whole sidebar palette that would have split the app into two visual languages. Three dead components and four unused primitives went too, and dropping the chart primitive took a charting library out with it — which then exposed a dependency the project had been relying on without ever declaring it.",
          "One is a documented exception rather than a fix. The gradient covers on the dashboard stay, because they make each generated deck recognisable in a grid of otherwise identical cards and the colour carries no meaning. The exception is written at the definition and in the project rules, so it can't quietly spread to navigation, status or data.",
          "Two are simply still open, and say so: the app has two heading systems, and the password field is defined twice across two dialogs. Leaving them visible is the point. A design system that only records its wins has stopped being a measurement.",
        ],
      },
      {
        heading: "One contract, three languages",
        lead: "A new content type should extend a contract, not invent one.",
        body: [
          "The same content blocks — metrics, findings, recommendations, charts — exist in three places, written in three different languages: the content schema, the TypeScript types and queries in the app, and the Python models in the pipeline. They're deliberately kept to one shape.",
          "That's the half of a design system people forget. Visual consistency is the visible half. The useful half is cutting down the number of decisions every future feature has to make. It also means a malformed model response fails loudly at a seam, instead of leaking quietly into a client's deck.",
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
        lead: "The architecture is where the boundary actually gets enforced.",
        body: [
          "The responsibilities split cleanly. A Next.js app owns the interface, chat, uploads and deck rendering. A FastAPI service builds the slide plan. A content store holds reports, chats and plans. A local model does the inference, so research never leaves the machine.",
          "Every seam carries a type instead of free text, and every seam repeats the boundary I set at the start: the model brings the intelligence, the code owns the numbers, the structure, the styling and the availability. The renderer takes the slide plan as a container of content and rearranges what's inside it. It doesn't take the plan's slide count or its running order, because the plan isn't evidence.",
          "The technical design isn't separate from the experience. It's the thing that makes the experience repeatable.",
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
        lead: "AI speeds up the execution. The quality bar is still mine.",
        body: [
          "uxproof is built with an AI-assisted workflow. Generation is genuinely good at scaffolding, repetitive implementation, refactors and test plumbing. It is not good at deciding what a product should refuse to do.",
          "So the constraints live in the repository instead of in my memory. The project's rules file states them flatly: the model never supplies a number; every model step has a deterministic fallback; the deck template has one source of truth and no colour, typeface, size or margin is written anywhere else; and the app's violet and the deck's violet are separate systems that mustn't leak into each other.",
          "When generated code kept slipping one-off spacing values and accent colours into the deck renderer, the fix wasn't correcting each one. I moved the rule into the branding module and into the project constraints, so the next generated file is constrained by the system instead of reviewed against it. That's the same move as the grounding gate, pointed at my own tooling.",
        ],
      },
      {
        heading: "Validation",
        lead: "Tested, built, and not yet measured — I keep those apart.",
        body: [
          "The trust boundary is unit-tested rather than assumed: 120 tests across six suites pin down what the product accepts and what it throws away. They cover the grounding gate, the report parser and its column aliases, the quote and task guardrails, the citation locator, and the deck gate — including that the same data always produces the same deck, that a section divider never appears without a section behind it, and that findings the source report never recorded get dropped along with the section they would have created.",
          "One bug from that suite is worth naming. Quotes were being matched against a copy of the document with the commas stripped out, which silently rejected every quote containing a comma — which is most of them. It's a test now.",
          "What isn't tested is stated just as plainly. There are no component tests, no end-to-end tests and no automated accessibility checks. Contrast is measured and written down; interaction accessibility is built and reviewed by hand, not verified by a tool. Those are different claims and I don't blur them.",
        ],
        image: {
          src: "/uxproof-app-summary.jpg",
          caption:
            "[ EVERY CLAIM CARRIES THE PAGE IT CAME FROM, AND THE FIGURES ARE FILED AGAINST A PERIOD ]",
          alt: "An AI summary of an uploaded research PDF in the uxproof chat: metrics, key findings and recommendations, each claim followed by the page it was read from, and a closing line saying the research data was extracted and filed under Q3 2026",
        },
      },
      {
        heading: "Outcome",
        lead: "Research to deck, in a sentence.",
        body: [
          "What it shows: a chat-first workflow over research you uploaded yourself; a deck whose length follows the evidence and whose every number traces back to a document you supplied; a published design system with measured contrast and a finished round of fixes; and fallbacks that keep the thing usable with the model switched off.",
          "What it doesn't show: adoption, real usage, or measured time saved. It's a working concept, built end to end — and I'd rather say that than borrow numbers it hasn't earned.",
        ],
        image: {
          src: "/uxproof-app-deck-ready.jpg",
          caption:
            "[ THE DECK, READY TO DOWNLOAD — THE STRIP SHOWS WHAT THIS DATA ACTUALLY PRODUCED ]",
          alt: "The uxproof chat on a tablet with a finished presentation card: a strip of slide thumbnails labelled cover, contents, executive summary, study at a glance, section, finding, findings summary and recommendations, above a download button",
        },
      },
      {
        heading: "What I'd carry forward",
        lead: "Design the boundary before you design the feature.",
        body: [
          "The thing worth carrying isn't an AI pattern. It's that quality which depends on someone remembering isn't quality yet — it's an intention. Decide early what the model owns, what the product owns and what the person needs to understand. Then put each of those decisions somewhere it can't be forgotten: a gate, a type, a token, a test, a rule in the repo.",
          "Once those boundaries existed, everything downstream got easier to reason about — interaction states, fallbacks, accessibility, component contracts, the architecture itself. On any complex product I'd start in the same place: decide who owns what, design the interaction, build the mechanism, measure it, and publish what it still gets wrong.",
        ],
      },
    ],
    hero: {
      src: "/uxproof-deck-in-room.jpg",
      caption:
        "[ THE DELIVERABLE, IN THE ROOM IT'S BUILT FOR — THE FINDINGS POSTER, THE DECK'S ONE VIOLET STATEMENT SLIDE ]",
      alt: "A generated uxproof deck on a meeting-room screen in front of a seated audience: the violet findings-summary slide, a large figure beside a numbered list of four findings",
    },
  },
];

export const getCaseStudy = (slug: string): CaseStudy | undefined =>
  caseStudies.find((c) => c.slug === slug);

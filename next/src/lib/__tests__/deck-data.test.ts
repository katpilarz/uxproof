// The deck is a library of slide types, not a fixed run. These lock the
// rule that carries the whole design: a slide exists only when the data
// behind it exists — never padded, never speculative.

import { describe, it, expect } from 'vitest';
import { harvestDeckData, buildDeck, type DeckData } from '../ppt/deck-data';

interface Block { _type: string; [k: string]: unknown }

const kpi = (label: string, value: string, change?: number): Block =>
  ({ _type: 'kpiItem', label, value, change });
const issue = (title: string, severity = 'high'): Block =>
  ({ _type: 'issueItem', title, severity, description: `Why ${title} matters.` });
const rec = (title: string): Block => ({ _type: 'priorityItem', title, description: 'Do this.' });

const planOf = (...content: Block[]) => ({ slides: [{ slideNumber: 1, content }] });

const empty: DeckData = {
  period: 'Q3 2026', metrics: [], findings: [], recommendations: [],
  tasks: [], participantScores: [], quotes: [],
};
const kinds = (d: DeckData) => buildDeck(d).map(s => s.kind);

describe('harvestDeckData', () => {
  it('collects metrics, findings and recommendations out of the plan', () => {
    const d = harvestDeckData(planOf(kpi('SUS', '71'), issue('Trust drops'), rec('Ship links')), 'Q3 2026');
    expect(d.metrics).toHaveLength(1);
    expect(d.findings[0].title).toBe('Trust drops');
    expect(d.recommendations[0].title).toBe('Ship links');
  });

  it('keeps a metric once when the plan repeats it across slides', () => {
    const plan = { slides: [
      { slideNumber: 2, content: [kpi('SUS', '71')] },
      { slideNumber: 4, content: [kpi('SUS', '71'), kpi('Task success', '83%')] },
    ] };
    expect(harvestDeckData(plan, 'Q3 2026').metrics.map(m => m.label)).toEqual(['SUS', 'Task success']);
  });

  it('ignores a chart with fewer than two points — that is not a trend', () => {
    const one = planOf({ _type: 'chartBlock', chartData: [{ name: 'SUS', labels: ['Q3'], values: [71] }] });
    expect(harvestDeckData(one, 'Q3 2026').trend).toBeUndefined();

    const two = planOf({ _type: 'chartBlock', chartData: [{ name: 'SUS', labels: ['Q2', 'Q3'], values: [69, 71] }] });
    expect(harvestDeckData(two, 'Q3 2026').trend?.series[0].values).toEqual([69, 71]);
  });

  it('drops blocks with no title or value rather than emitting blanks', () => {
    const d = harvestDeckData(planOf(kpi('', '71'), kpi('SUS', ''), issue('')), 'Q3 2026');
    expect(d.metrics).toEqual([]);
    expect(d.findings).toEqual([]);
  });

  it('survives a malformed plan', () => {
    expect(harvestDeckData(null, 'Q3 2026').metrics).toEqual([]);
    expect(harvestDeckData({ slides: 'nope' }, 'Q3 2026').findings).toEqual([]);
  });
});

describe('buildDeck — the gate', () => {
  it('emits a cover and nothing else when there is no data', () => {
    expect(kinds(empty)).toEqual(['cover']);
  });

  it('never pads to reach a slide count', () => {
    // One metric earns a cover, its glance card, and the definition of the
    // one term used — and nothing else. The old template always emitted 8.
    const deck = buildDeck({ ...empty, metrics: [{ label: 'SUS', value: '71' }] });
    expect(deck.map(s => s.kind)).toEqual(['cover', 'glance', 'appendix']);
  });

  it('omits the findings section entirely when there are no findings', () => {
    const k = kinds({ ...empty, metrics: [{ label: 'SUS', value: '71' }] });
    expect(k).not.toContain('divider');
    expect(k).not.toContain('finding');
    expect(k).not.toContain('exec-summary');
  });

  it('opens a section divider only when a section follows it', () => {
    const k = kinds({ ...empty, recommendations: [{ title: 'Ship links' }] });
    expect(k.filter(x => x === 'divider')).toHaveLength(1);
    expect(k).toContain('recommendations');
  });

  it('gives one finding slide per finding', () => {
    const findings = ['A', 'B', 'C'].map(t => ({ title: t }));
    const k = kinds({ ...empty, findings });
    expect(k.filter(x => x === 'finding')).toHaveLength(3);
  });

  it('holds the violet summary poster back until there are findings to collect', () => {
    expect(kinds({ ...empty, findings: [{ title: 'Only one' }] })).not.toContain('findings-summary');
    expect(kinds({ ...empty, findings: [{ title: 'One' }, { title: 'Two' }] })).toContain('findings-summary');
  });

  it('skips the contents page for a deck too short to navigate', () => {
    expect(kinds({ ...empty, metrics: [{ label: 'SUS', value: '71' }] })).not.toContain('contents');
  });

  it('adds a contents page once the deck has sections worth listing', () => {
    const k = kinds({
      ...empty,
      metrics:  [{ label: 'SUS', value: '71' }],
      findings: [{ title: 'One' }, { title: 'Two' }],
    });
    expect(k[0]).toBe('cover');
    expect(k[1]).toBe('contents');
  });

  it('numbers the dividers in the order the sections appear', () => {
    const deck = buildDeck({
      ...empty,
      findings:        [{ title: 'One' }, { title: 'Two' }],
      trend:           { labels: ['Q2', 'Q3'], series: [{ name: 'SUS', values: [69, 71] }] },
      recommendations: [{ title: 'Ship links' }],
    });
    const numerals = deck
      .filter((s): s is Extract<typeof s, { kind: 'divider' }> => s.kind === 'divider')
      .map(d => `${d.numeral} ${d.title}`);
    expect(numerals).toEqual(['01 Findings', '02 Measures', '03 Response']);
  });

  it('renumbers when an earlier section is absent', () => {
    const deck = buildDeck({ ...empty, recommendations: [{ title: 'Ship links' }] });
    const divider = deck.find(s => s.kind === 'divider');
    expect(divider?.kind === 'divider' && divider.numeral).toBe('01');
  });

  it('defines only the terms the deck actually used', () => {
    const deck = buildDeck({ ...empty, metrics: [{ label: 'SUS Score', value: '71' }] });
    const appendix = deck.find(s => s.kind === 'appendix');
    expect(appendix?.kind === 'appendix' && appendix.terms.map(t => t.term)).toEqual(['SUS']);
  });

  it('has no appendix when no defined metric appeared', () => {
    expect(kinds({ ...empty, findings: [{ title: 'One' }] })).not.toContain('appendix');
  });

  it('is deterministic — the same data always yields the same deck', () => {
    const data: DeckData = {
      ...empty,
      metrics:  [{ label: 'SUS', value: '71', change: -2 }],
      findings: [{ title: 'One' }, { title: 'Two' }],
    };
    expect(kinds(data)).toEqual(kinds(data));
  });
});

describe('grounding — the plan is not evidence', () => {
  // The planning agent emits issueItem and priorityItem blocks even for a
  // report whose issues array is empty. Without a ceiling the deck grows a
  // Findings section out of content the research never recorded.
  const inventedPlan = planOf(
    kpi('SUS', '64'),
    issue('Invented one'), issue('Invented two'), issue('Invented three'),
    rec('Invented fix'),
  );

  it('drops findings the source report never recorded', () => {
    const d = harvestDeckData(inventedPlan, 'Q1 2027', { issues: 0, insights: 0 });
    expect(d.findings).toEqual([]);
    expect(d.recommendations).toEqual([]);
  });

  it('leaves no Findings section behind once they are dropped', () => {
    const k = buildDeck(harvestDeckData(inventedPlan, 'Q1 2027', { issues: 0, insights: 0 }))
      .map(s => s.kind);
    expect(k).not.toContain('finding');
    expect(k).not.toContain('findings-summary');
    expect(k).not.toContain('exec-summary');
    expect(k).toContain('glance');   // the metric it really has survives
  });

  it('keeps exactly as many findings as the report recorded', () => {
    const d = harvestDeckData(inventedPlan, 'Q1 2027', { issues: 2, insights: 0 });
    expect(d.findings.map(f => f.title)).toEqual(['Invented one', 'Invented two']);
  });

  it('lets a recommendation through when either an issue or an insight backs it', () => {
    expect(harvestDeckData(inventedPlan, 'Q1 2027', { issues: 0, insights: 1 }).recommendations)
      .toHaveLength(1);
    expect(harvestDeckData(inventedPlan, 'Q1 2027', { issues: 1, insights: 0 }).recommendations)
      .toHaveLength(1);
  });

  it('changes nothing when no grounding is supplied', () => {
    expect(harvestDeckData(inventedPlan, 'Q1 2027').findings).toHaveLength(3);
  });
});

describe('grounding — metrics the study never measured', () => {
  // The planning agent emits a kpiItem per metric slot regardless of the
  // report, which is how a study with no NPS ends up with an "NPS +0" card.
  const plan = planOf(
    kpi('SUS Score', '71'),
    kpi('Task Success Rate', '83%'),
    kpi('NPS', '+0'),
    kpi('Participants', '12'),
  );
  const recorded = { issues: 0, insights: 0, metrics: ['susScore', 'taskSuccessRate', 'participants'] };

  it('drops a metric card the report has no value for', () => {
    const labels = harvestDeckData(plan, 'Q3 2026', recorded).metrics.map(m => m.label);
    expect(labels).toEqual(['SUS Score', 'Task Success Rate', 'Participants']);
    expect(labels).not.toContain('NPS');
  });

  it('keeps an unrecognised label rather than deleting it silently', () => {
    const custom = planOf(kpi('Onboarding completion', '64%'));
    expect(harvestDeckData(custom, 'Q3 2026', recorded).metrics.map(m => m.label))
      .toEqual(['Onboarding completion']);
  });

  it('leaves every metric alone when availability is unknown', () => {
    expect(harvestDeckData(plan, 'Q3 2026', { issues: 0, insights: 0 }).metrics).toHaveLength(4);
  });
});

describe('detail from the report — the slides that were empty before', () => {
  const tasks = [
    { code: 'T1', name: 'Review summary', successRate: 100, medianTime: '1:12', errors: 0 },
    { code: 'T2', name: 'Find owner',     successRate: 67,  medianTime: '2:48', errors: 6 },
    { code: 'T3', name: 'Correct decision', successRate: 57, medianTime: '3:31', errors: 9 },
  ];
  const scores = ['P01','P02','P03','P04'].map((participant, i) => ({ participant, score: 60 + i * 5 }));
  const quotes = [
    { text: 'Show me the sentence it came from and I will trust it.', attribution: 'P09 · Founder' },
    { text: 'I fixed three things and it all went.', attribution: 'P11 · CS' },
  ];
  const facts = { issues: 2, insights: 0, tasks, participantScores: scores, quotes };

  it('carries report detail the plan never held', () => {
    const d = harvestDeckData(planOf(kpi('SUS', '71')), 'Q3 2026', facts);
    expect(d.tasks).toHaveLength(3);
    expect(d.participantScores).toHaveLength(4);
    expect(d.quotes).toHaveLength(2);
  });

  it('adds a Task Performance slide once there are tasks to compare', () => {
    const k = buildDeck({ ...empty, tasks }).map(s => s.kind);
    expect(k).toContain('task-performance');
    expect(k).toContain('divider');   // and the Measures section that holds it
  });

  it('does not plot a single task — that is a fact, not a comparison', () => {
    expect(buildDeck({ ...empty, tasks: tasks.slice(0, 1) }).map(s => s.kind))
      .not.toContain('task-performance');
  });

  it('plots SUS by participant once there is a distribution', () => {
    const deck = buildDeck({ ...empty, participantScores: scores });
    const slide = deck.find(s => s.kind === 'sus-participants');
    expect(slide?.kind === 'sus-participants' && slide.benchmark).toBe(68);
  });

  it('does not plot two participants', () => {
    expect(buildDeck({ ...empty, participantScores: scores.slice(0, 2) }).map(s => s.kind))
      .not.toContain('sus-participants');
  });

  it('gives each finding its own quote, in order', () => {
    const deck = buildDeck({
      ...empty,
      findings: [{ title: 'One' }, { title: 'Two' }],
      quotes,
    });
    const findings = deck.filter(s => s.kind === 'finding');
    expect(findings).toHaveLength(2);
    expect(findings[0].kind === 'finding' && findings[0].quote?.attribution).toBe('P09 · Founder');
    expect(findings[1].kind === 'finding' && findings[1].quote?.attribution).toBe('P11 · CS');
  });

  it('leaves a finding without a quote when the report recorded none', () => {
    const deck = buildDeck({ ...empty, findings: [{ title: 'One' }] });
    const finding = deck.find(s => s.kind === 'finding');
    expect(finding?.kind === 'finding' && finding.quote).toBeUndefined();
  });
});

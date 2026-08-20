export default {
  name: 'report',
  title: 'UX Research Reports',
  type: 'document',
  fields: [
    { name: 'reportId', title: 'Report ID', type: 'string' },
    {
      name: 'user',
      title: 'Owner',
      type: 'reference',
      to: [{ type: 'user' }],
      description: 'Reports are per-user: created from that user\'s uploaded files.',
    },
    {
      name: 'quarter',
      title: 'Quarter',
      type: 'string',
      options: { list: ['Q1', 'Q2', 'Q3', 'Q4'] },
    },
    { name: 'year', title: 'Year', type: 'number' },

    // ── Engagement ──
    { name: 'client', title: 'Client', type: 'string' },
    { name: 'product', title: 'Product / Surface', type: 'string' },
    {
      name: 'platform',
      title: 'Platform',
      type: 'string',
      options: {
        list: ['website', 'mobile app', 'saas platform', 'e-commerce', 'design system', 'internal tool'],
      },
    },
    {
      name: 'methods',
      title: 'Research Methods',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'e.g. moderated usability testing, heuristic evaluation, analytics audit, survey, A/B test',
    },

    // ── Core UX metrics ──
    { name: 'susScore', title: 'SUS Score (0-100)', type: 'number' },
    { name: 'susChange', title: 'SUS Change vs Previous Quarter (points)', type: 'number' },
    { name: 'taskSuccessRate', title: 'Task Success Rate %', type: 'number' },
    { name: 'npsScore', title: 'Net Promoter Score', type: 'number' },
    { name: 'participants', title: 'Research Participants', type: 'number' },
    { name: 'errorRate', title: 'Task Error Rate %', type: 'number' },
    { name: 'conversionRate', title: 'Key-Flow Conversion %', type: 'number' },

    // ── KPIs as structured objects ──
    {
      name: 'kpis',
      title: 'Key UX Indicators',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', title: 'KPI Label', type: 'string' },
            { name: 'value', title: 'Value', type: 'string' },
            { name: 'change', title: 'Change %', type: 'number' },
            {
              name: 'trend',
              title: 'Trend',
              type: 'string',
              options: { list: ['up', 'down', 'stable'] },
            },
          ],
        },
      ],
    },

    // ── Usability issues ──
    {
      name: 'issues',
      title: 'Usability Issues',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'title', title: 'Issue Title', type: 'string' },
            {
              name: 'severity',
              title: 'Severity',
              type: 'string',
              options: { list: ['low', 'medium', 'high'] },
            },
            { name: 'description', title: 'Description', type: 'text' },
            { name: 'recommendation', title: 'Recommendation', type: 'text' },
          ],
        },
      ],
    },

    // ── Detailed research data ──
    //
    // A UX report carries far more than seven scalars: per-task results,
    // per-participant scores, what people actually said. These arrays are
    // what let the Dossier deck render its Task Performance, SUS by
    // Participant and evidence-carrying finding slides — each of those
    // slides appears only when the array behind it has content.
    //
    // Everything here is EXTRACTED, never generated: the upload route
    // validates each number against the source document and drops what it
    // cannot find (lib/report-parsing.ts).
    {
      name: 'tasks',
      title: 'Task Performance',
      type: 'array',
      description: 'Per-task results — drives the Task Performance slide.',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'code',        title: 'Task Code',      type: 'string' },  // "T1"
            { name: 'name',        title: 'Task Name',      type: 'string' },
            { name: 'successRate', title: 'Success Rate %', type: 'number' },
            { name: 'medianTime',  title: 'Median Time',    type: 'string' },  // "3:31"
            { name: 'errors',      title: 'Errors',         type: 'number' },
          ],
        },
      ],
    },
    {
      name: 'participantScores',
      title: 'SUS by Participant',
      type: 'array',
      description: 'Individual SUS scores — drives the SUS by Participant slide.',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'participant', title: 'Participant', type: 'string' },  // "P01"
            { name: 'score',       title: 'SUS Score',   type: 'number' },
          ],
        },
      ],
    },
    {
      name: 'quotes',
      title: 'Participant Quotes',
      type: 'array',
      description:
        'Verbatim quotes with attribution. Finding slides carry one as their ' +
        'evidence; without them the slide has a title and nothing under it.',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'text',        title: 'Quote',       type: 'text' },
            { name: 'attribution', title: 'Attribution', type: 'string' },  // "P04 · Engineering lead"
          ],
        },
      ],
    },

    // ── Research insights ──
    {
      name: 'insights',
      title: 'Research Insights',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'category',
              title: 'Category',
              type: 'string',
              options: {
                list: ['usability', 'behavioral', 'accessibility', 'opportunity'],
              },
            },
            { name: 'title', title: 'Insight Title', type: 'string' },
            { name: 'summary', title: 'Summary', type: 'text' },
          ],
        },
      ],
    },
  ],
};

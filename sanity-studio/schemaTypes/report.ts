export default {
  name: 'report',
  title: 'UX Research Reports',
  type: 'document',
  fields: [
    { name: 'reportId', title: 'Report ID', type: 'string' },
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

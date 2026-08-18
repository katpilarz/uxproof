import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'executiveIntelligence',
  title: 'UX Intelligence',
  type: 'document',
  fields: [
    defineField({ name: 'reportId',         type: 'string',  title: 'Report ID' }),
    defineField({ name: 'quarter',          type: 'string',  title: 'Quarter' }),
    defineField({ name: 'year',             type: 'number',  title: 'Year' }),
    defineField({ name: 'executiveSummary', type: 'text',    title: 'Executive Summary' }),
    defineField({ name: 'confidenceScore',  type: 'number',  title: 'Confidence Score' }),
    defineField({ name: 'processedAt',      type: 'datetime',title: 'Processed At' }),
    defineField({
      name: 'kpiSummaries', title: 'KPI Summaries', type: 'array',
      of: [{ type: 'object', fields: [
        { name: 'label',   type: 'string' },
        { name: 'value',   type: 'string' },
        { name: 'change',  type: 'number' },
        { name: 'trend',   type: 'string' },
        { name: 'insight', type: 'text'   },
      ]}],
    }),
    defineField({
      name: 'metricSignals', title: 'Metric Signals', type: 'array',
      of: [{ type: 'object', fields: [
        { name: 'metric',    type: 'string' },
        { name: 'current',   type: 'number' },
        { name: 'previous',  type: 'number' },
        { name: 'deltaPct',  type: 'number' },
        { name: 'narrative', type: 'text'   },
      ]}],
    }),
    defineField({
      name: 'issueHighlights', title: 'Issue Highlights', type: 'array',
      of: [{ type: 'object', fields: [
        { name: 'title',          type: 'string' },
        { name: 'severity',       type: 'string' },
        { name: 'signal',         type: 'text'   },
        { name: 'recommendation', type: 'text'   },
      ]}],
    }),
   defineField({
  name: 'strategicSignals',
  type: 'array',
  of: [{ type: 'object', fields: [
    defineField({ name: 'signal', type: 'string' })
  ]}]
})
  ],
});

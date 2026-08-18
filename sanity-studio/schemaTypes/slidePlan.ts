// schemas/slidePlan.ts
//
// KEY FIXES:
//  1. Adds `slideNumber` (1-8) and `slideType` discriminator so the
//     ppt-generator can pick the right layout deterministically.
//  2. Adds `content[]` — the SAME shape ppt-generator.ts reads back.
//     Each entry is a NAMED Sanity object type:
//       subtitleBlock | kpiItem | chartBlock | issueItem | priorityItem
//     Sanity auto-stamps `_type` with the object-type name on write;
//     do NOT declare `_type` as a field (Sanity reserves leading "_").
//  3. Legacy `bullets` kept as fallback.

import { defineField, defineType, defineArrayMember } from 'sanity';

export default defineType({
  name: 'slidePlan',
  title: 'Slide Plan',
  type: 'document',
  fields: [
    defineField({ name: 'reportId',          type: 'string',   title: 'Report ID' }),
    defineField({ name: 'period',            type: 'string',   title: 'Period' }),
    defineField({ name: 'presentationTitle', type: 'string',   title: 'Presentation Title' }),
    defineField({ name: 'totalSlides',       type: 'number',   title: 'Total Slides' }),
    defineField({ name: 'narrativeArc',      type: 'text',     title: 'Narrative Arc' }),
    defineField({ name: 'generatedAt',       type: 'datetime', title: 'Generated At' }),

    defineField({
      name: 'slides', title: 'Slides', type: 'array',
      of: [defineArrayMember({
        type: 'object',
        name: 'slideItem',
        fields: [
          // ── Generator contract ─────────────────────────────────────────
          defineField({
            name: 'slideNumber',
            type: 'number',
            title: 'Slide Number (1-8)',
            description:
              'Maps to ppt-generator slot. 1=Cover, 2=Headline Score, 3=Trend, 4=KPI, 5=Issues, 6=Recommendations, 7=Summary, 8=Thank You',
          }),
          defineField({
            name: 'slideType',
            type: 'string',
            title: 'Slide Type',
            options: {
              list: [
                { value: 'title',   title: 'Title (cover)' },
                { value: 'kpi',     title: 'KPI (slide 2 or 4)' },
                { value: 'trend',   title: 'Trend chart (slide 3)' },
                { value: 'issue',   title: 'Usability Issues (slide 5)' },
                { value: 'insight', title: 'Recommendations (slide 6)' },
                { value: 'summary', title: 'Summary or Thank You' },
              ],
            },
          }),

          // ── Display text ───────────────────────────────────────────────
          defineField({ name: 'title',    type: 'string', title: 'Title' }),
          defineField({ name: 'subtitle', type: 'string', title: 'Subtitle' }),

          // ── Structured content[] — primary path for the generator ──────
          // Each member is a NAMED object type. Sanity auto-assigns
          // _type = <object name> on write — DO NOT declare _type here.
          defineField({
            name: 'content',
            title: 'Content (structured)',
            type: 'array',
            of: [
              // Subtitle / marketing tagline / summary paragraph
              defineArrayMember({
                type: 'object',
                name: 'subtitleBlock',
                title: 'Subtitle / Text Block',
                fields: [
                  defineField({ name: 'text', type: 'text', title: 'Text' }),
                ],
              }),
              // KPI card (slides 2 & 4)
              defineArrayMember({
                type: 'object',
                name: 'kpiItem',
                title: 'KPI Item',
                fields: [
                  defineField({ name: 'label',  type: 'string', title: 'Label' }),
                  defineField({ name: 'value',  type: 'string', title: 'Value' }),
                  defineField({ name: 'change', type: 'number', title: 'Change %' }),
                  defineField({ name: 'trend',  type: 'string', title: 'Trend (up|down|stable)' }),
                ],
              }),
              // Line chart (slide 3) — pptxgenjs series shape
              defineArrayMember({
                type: 'object',
                name: 'chartBlock',
                title: 'Chart',
                fields: [
                  defineField({
                    name: 'chartData',
                    title: 'Chart Data (pptxgenjs series)',
                    type: 'array',
                    of: [defineArrayMember({
                      type: 'object',
                      name: 'chartSeries',
                      fields: [
                        defineField({ name: 'name', type: 'string', title: 'Series name' }),
                        defineField({
                          name: 'labels',
                          type: 'array',
                          of: [{ type: 'string' }],
                          title: 'X-axis labels',
                        }),
                        defineField({
                          name: 'values',
                          type: 'array',
                          of: [{ type: 'number' }],
                          title: 'Y values',
                        }),
                      ],
                    })],
                  }),
                ],
              }),
              // Usability-issue column (slide 5)
              defineArrayMember({
                type: 'object',
                name: 'issueItem',
                title: 'Usability Issue',
                fields: [
                  defineField({ name: 'title',       type: 'string', title: 'Issue title' }),
                  defineField({ name: 'description', type: 'text',   title: 'Description' }),
                  defineField({ name: 'severity',    type: 'string', title: 'Severity' }),
                ],
              }),
              // Recommendation column (slide 6)
              defineArrayMember({
                type: 'object',
                name: 'priorityItem',
                title: 'Recommendation',
                fields: [
                  defineField({ name: 'title',       type: 'string', title: 'Recommendation title' }),
                  defineField({ name: 'description', type: 'text',   title: 'Description' }),
                ],
              }),
            ],
          }),

          // ── Optional / legacy ──────────────────────────────────────────
          defineField({
            name: 'bullets',
            type: 'array',
            title: 'Bullets (legacy fallback)',
            of: [defineArrayMember({
              type: 'object',
              name: 'bulletItem',
              fields: [defineField({ name: 'text', type: 'string', title: 'Text' })],
            })],
          }),
          defineField({ name: 'speakerNotes', type: 'text', title: 'Speaker Notes' }),
        ],
      })],
    }),
  ],
});
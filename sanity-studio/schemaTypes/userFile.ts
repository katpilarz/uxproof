// Files / reports uploaded by a user through the chat "+" button. The
// Next.js /api/files route extracts the text, writes an AI (or fallback)
// summary, and — when the content parses as structured UX research data —
// also creates user-owned `report` documents from it. This type is the
// user's file directory: everything they've uploaded, newest first.
export default {
  name: 'userFile',
  title: 'User Files',
  type: 'document',
  fields: [
    {
      name: 'user',
      title: 'Owner',
      type: 'reference',
      to: [{ type: 'user' }],
      validation: (rule: any) => rule.required(),
    },
    { name: 'filename',  title: 'Filename',   type: 'string' },
    { name: 'mimeType',  title: 'MIME Type',  type: 'string' },
    { name: 'size',      title: 'Size (bytes)', type: 'number' },
    {
      name: 'summary',
      title: 'Summary',
      type: 'text',
      description: 'AI-written (or deterministic fallback) summary of the file.',
    },
    {
      name: 'textContent',
      title: 'Extracted Text',
      type: 'text',
      description: 'Plain-text content extracted at upload time (truncated).',
    },
    {
      name: 'reportsCreated',
      title: 'Report Periods Parsed',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Periods (e.g. "Q3 2025") turned into report documents from this file.',
    },
    { name: 'sessionId',  title: 'Uploaded In Session', type: 'string' },
    { name: 'uploadedAt', title: 'Uploaded At', type: 'datetime' },
  ],
  preview: {
    select: { title: 'filename', subtitle: 'summary' },
  },
};

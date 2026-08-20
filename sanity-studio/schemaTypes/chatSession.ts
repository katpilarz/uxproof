// A conversation. `title` is the user's own name for it, set by renaming
// the row in the chat history sidebar (PATCH /api/sessions/[sessionId]).
// When it's unset the sidebar falls back to the last message's text, which
// is why this field is optional rather than defaulted.
export default {
  name: 'chatSession',
  title: 'Chat Sessions',
  type: 'document',
  fields: [
    {
      name: 'sessionId',
      title: 'Session ID',
      type: 'string',
    },
    {
      name: 'user',
      title: 'Owner',
      type: 'reference',
      to: [{ type: 'user' }],
    },
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'User-chosen name for the conversation. Falls back to the last message when empty.',
    },
    {
      name: 'quarter',
      title: 'Quarter',
      type: 'string',
    },
    {
      name: 'messages',
      title: 'Messages',
      type: 'array',
      of: [{ type: 'chatMessage' }],
    },
    {
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
    },
  ],
};
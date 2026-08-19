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
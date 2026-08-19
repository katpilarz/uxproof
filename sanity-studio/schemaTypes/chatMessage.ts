export default {
  name: 'chatMessage',
  title: 'Chat Message',
  type: 'object',
  fields: [
    {
      name: 'messageId',
      title: 'Message ID',
      type: 'string',
    },
    {
      name: 'role',
      title: 'Role',
      type: 'string',
      options: {
        list: ['user', 'assistant'],
        layout: 'radio',
      },
    },
    {
      name: 'content',
      title: 'Content',
      type: 'text',
    },
    {
      name: 'timestamp',
      title: 'Timestamp',
      type: 'datetime',
    },
    // Presentation-card metadata written by appendMessageToSession so
    // history restore can re-render the card on assistant messages.
    {
      name: 'showPresentation',
      title: 'Show Presentation Card',
      type: 'boolean',
    },
    {
      name: 'presentationScope',
      title: 'Presentation Scope',
      type: 'string',
      options: {
        list: ['quarter', 'year'],
        layout: 'radio',
      },
    },
    {
      name: 'year',
      title: 'Presentation Year',
      type: 'number',
    },
    {
      name: 'quarter',
      title: 'Presentation Quarter',
      type: 'string',
    },
    {
      name: 'contextQuarter',
      title: 'Context Period Label',
      type: 'string',
      description: 'Human label of the resolved period, e.g. "Full Year 2025"',
    },
  ],
};
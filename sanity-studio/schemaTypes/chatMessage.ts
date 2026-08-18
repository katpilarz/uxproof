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
  ],
};
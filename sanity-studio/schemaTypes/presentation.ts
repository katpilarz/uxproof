export default {
  name: 'presentation',
  title: 'Generated Presentations',
  type: 'document',
  fields: [
    { name: 'presentationId', title: 'Presentation ID', type: 'string' },
    { name: 'title', title: 'Presentation Title', type: 'string' },
    { name: 'slidesCount', title: 'Number of Slides', type: 'number' },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { value: 'processing', label: 'Processing' },
          { value: 'completed', label: 'Completed' },
        ],
      },
    },
    { name: 'downloadUrl', title: 'Download URL', type: 'url' },
    { name: 'generatedDate', title: 'Generated Date', type: 'datetime' },
  ],
};
// App users — created by the Next.js /api/auth/login route the first time
// an email signs in. The _id is deterministic (`user_<sha256(email) prefix>`)
// so repeat logins always resolve to the same document. Chat sessions and
// generated presentations hold a reference to their owner.
export default {
  name: 'user',
  title: 'Users',
  type: 'document',
  fields: [
    {
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (rule: any) =>
        rule.required().email().error('A valid email address is required'),
    },
    {
      name: 'name',
      title: 'Display Name',
      type: 'string',
    },
    {
      name: 'avatar',
      title: 'Avatar',
      type: 'image',
      options: { hotspot: true },
    },
    {
      name: 'createdAt',
      title: 'First Signed In',
      type: 'datetime',
    },
    {
      name: 'lastLoginAt',
      title: 'Last Signed In',
      type: 'datetime',
    },
  ],
  preview: {
    select: { title: 'email', subtitle: 'name', media: 'avatar' },
  },
};

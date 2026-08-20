// App users — created by the Next.js /api/auth/register route when an
// email first signs up. The _id is deterministic (`user_<sha256(email)
// prefix>`) so repeat logins always resolve to the same document. Chat
// sessions and generated presentations hold a reference to their owner.
//
// `passwordHash` holds a scrypt digest written by the Next.js auth routes
// (lib/auth.ts). It is never editable or readable through the Studio UI,
// and never leaves the server — the app's own API strips it before any
// user object reaches a browser.
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
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      readOnly: true,
      hidden: true,
      description:
        'scrypt digest of the account password, written by the app. Never edit by hand — ' +
        'clearing it lets the next sign-in adopt a new password for this account.',
    },
    {
      name: 'passwordUpdatedAt',
      title: 'Password Last Changed',
      type: 'datetime',
      readOnly: true,
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

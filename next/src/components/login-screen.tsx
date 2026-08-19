'use client';

/**
 * components/login-screen.tsx
 *
 * Shown by AppShell whenever nobody is signed in. Signing in is claiming
 * an email identity (internal tool — no password): email + an optional
 * avatar image that's uploaded to Sanity and shown in the top-right menu.
 * Success is confirmed via toast (from the auth slice) and the shell
 * swaps straight into the app.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { UxproofMark } from '@/components/top-bar';
import { useLogin, useLoginPending } from '@/store';

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // keep in sync with /api/auth/login

export function LoginScreen() {
  const login   = useLogin();
  const pending = useLoginPending();

  const [email,  setEmail]  = useState('');
  const [error,  setError]  = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URL for the live avatar preview — derived from the picked file,
  // revoked when it's replaced or the screen unmounts.
  const avatarUrl = useMemo(() => (avatar ? URL.createObjectURL(avatar) : ''), [avatar]);
  useEffect(() => {
    return () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl); };
  }, [avatarUrl]);

  const handleFile = (file: File | null) => {
    setError('');
    if (!file) { setAvatar(null); return; }
    if (!file.type.startsWith('image/')) {
      setError('The avatar must be an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('The avatar image must be 4MB or smaller.');
      return;
    }
    setAvatar(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const form = new FormData();
    form.set('email', email);
    if (avatar) form.set('avatar', avatar);

    const result = await login(form);
    if (!result.ok) setError(result.error || 'Sign-in failed.');
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background text-foreground px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <UxproofMark className="size-12 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight lowercase">
            <span className="text-foreground">ux</span>proof
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 text-center">
            Sign in to keep your conversations and presentations together.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={avatar ? 'Change avatar image' : 'Upload avatar image'}
              className="relative size-20 rounded-full border border-dashed border-border bg-muted/40 overflow-hidden grid place-items-center hover:border-foreground/40 transition-colors group"
            >
              {avatarUrl ? (
                // Local preview of the picked file — plain <img> is intentional
                // (next/image can't optimize blob: URLs).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar preview" className="size-full object-cover" />
              ) : (
                <Camera className="size-6 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </button>
            {avatar ? (
              <button
                type="button"
                onClick={() => handleFile(null)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3" />
                Remove photo
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Profile photo (optional)</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={pending || !email.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? 'Signing in…' : 'Continue'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground/70 text-center mt-4">
          Your research data stays on this machine — signing in only separates
          each person&apos;s chats and decks.
        </p>
      </motion.div>
    </div>
  );
}

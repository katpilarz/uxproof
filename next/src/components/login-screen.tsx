'use client';

/**
 * components/login-screen.tsx
 *
 * Shown by AppShell whenever nobody is signed in. Two modes on one screen:
 *
 *   Sign in         — email + password, verified server-side.
 *   Create account  — email + password (twice) + optional display name and
 *                     avatar image, uploaded to Sanity.
 *
 * The two are deliberately explicit rather than one auto-registering form:
 * a typo in the email should be refused, not answered with a brand-new
 * empty workspace that looks like data loss.
 *
 * Success is confirmed via toast (from the auth slice) and the shell swaps
 * straight into the app.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { UxproofMark, LOGO_VIOLET } from '@/components/top-bar';
import { useLogin, useRegister, useLoginPending } from '@/store';
import { cn } from '@/lib/utils';

const MAX_AVATAR_BYTES  = 4 * 1024 * 1024; // keep in sync with lib/avatar.ts
const MIN_PASSWORD_CHARS = 8;              // keep in sync with lib/auth.ts

type Mode = 'signin' | 'signup';

/** Password field with a show/hide toggle — typing a password you can't
 *  see is the most common source of a failed sign-in. */
function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  autoFocus,
}: {
  id:            string;
  label:         string;
  value:         string;
  onChange:      (v: string) => void;
  autoComplete:  string;
  placeholder?:  string;
  autoFocus?:    boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const login    = useLogin();
  const register = useRegister();
  const pending  = useLoginPending();

  const [mode,    setMode]    = useState<Mode>('signin');
  const [email,   setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name,    setName]    = useState('');
  const [error,   setError]   = useState('');
  const [avatar,  setAvatar]  = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSignup = mode === 'signup';

  // Object URL for the live avatar preview — derived from the picked file,
  // revoked when it's replaced or the screen unmounts.
  const avatarUrl = useMemo(() => (avatar ? URL.createObjectURL(avatar) : ''), [avatar]);
  useEffect(() => {
    return () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl); };
  }, [avatarUrl]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setConfirm('');
  };

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

    if (!isSignup) {
      const result = await login(email, password);
      if (!result.ok) setError(result.error || 'Sign-in failed.');
      return;
    }

    // Client-side checks are a courtesy; /api/auth/register is the authority.
    if (password.length < MIN_PASSWORD_CHARS) {
      setError(`Password must be at least ${MIN_PASSWORD_CHARS} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }

    const form = new FormData();
    form.set('email', email);
    form.set('password', password);
    if (name.trim()) form.set('name', name.trim());
    if (avatar)      form.set('avatar', avatar);

    const result = await register(form);
    if (!result.ok) setError(result.error || 'Account creation failed.');
  };

  const canSubmit =
    !pending &&
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignup || confirm.length > 0);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background text-foreground px-4 py-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm my-auto"
      >
        <div className="flex flex-col items-center mb-6">
          <UxproofMark className="size-12 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight lowercase">
            <span style={{ color: LOGO_VIOLET }}>ux</span>proof
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 text-center">
            {isSignup
              ? 'Create an account to keep your conversations and presentations together.'
              : 'Sign in to pick up your conversations and presentations.'}
          </p>
        </div>

        {/* Mode switch */}
        <div
          role="tablist"
          aria-label="Sign in or create an account"
          className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-xl bg-muted/60"
        >
          {(['signin', 'signup'] as const).map(m => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={cn(
                'h-8 rounded-lg text-sm font-medium transition-colors',
                mode === m
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {/* Avatar + display name — signup only */}
          {isSignup && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={avatar ? 'Change avatar image' : 'Upload avatar image'}
                className="relative size-20 rounded-full border border-dashed border-border bg-muted/40 overflow-hidden grid place-items-center hover:border-violet-400 transition-colors group"
              >
                {avatarUrl ? (
                  // Local preview of the picked file — plain <img> is intentional
                  // (next/image can't optimize blob: URLs).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar preview" className="size-full object-cover" />
                ) : (
                  <Camera className="size-6 text-muted-foreground group-hover:text-violet-500 transition-colors" />
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
          )}

          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              required
              autoFocus={!isSignup}
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
            />
          </div>

          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="login-name">Display name (optional)</Label>
              <Input
                id="login-name"
                type="text"
                autoComplete="name"
                placeholder="How your name appears in the app"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}

          <PasswordInput
            id="login-password"
            label="Password"
            value={password}
            onChange={v => { setPassword(v); setError(''); }}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder={isSignup ? `At least ${MIN_PASSWORD_CHARS} characters` : undefined}
          />

          {isSignup && (
            <PasswordInput
              id="login-confirm"
              label="Confirm password"
              value={confirm}
              onChange={v => { setConfirm(v); setError(''); }}
              autoComplete="new-password"
            />
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending
              ? (isSignup ? 'Creating account…' : 'Signing in…')
              : (isSignup ? 'Create account'    : 'Sign in')}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground/70 text-center mt-4">
          Your research data stays on this machine — your account only
          separates each person&apos;s chats and decks.
        </p>
      </motion.div>
    </div>
  );
}

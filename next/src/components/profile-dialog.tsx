'use client';

/**
 * components/profile-dialog.tsx
 *
 * The account panel, opened from the avatar dropdown and anchored beneath
 * it in the top-right corner (same placement as SettingsDialog) so the
 * account, its menu, and its confirmations all live in one column.
 *
 * Two independent forms:
 *   Profile   — display name + avatar image (PATCH /api/auth/profile)
 *   Password  — current + new password      (POST  /api/auth/password)
 *
 * They save separately on purpose: changing your name shouldn't require
 * retyping a password, and a rejected password shouldn't discard a name
 * edit. Each confirms through the toast stack under the avatar.
 *
 * The email is shown read-only — it derives the deterministic user id, so
 * changing it would strand every chat, file and deck the account owns.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, KeyRound, Loader2, UserRound, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button }     from '@/components/ui/button';
import { Input }      from '@/components/ui/input';
import { Label }      from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AuthUser } from '@/store/slices/auth-slice';
import {
  useAuthUser,
  useProfileOpen,
  useProfilePending,
  useCloseProfile,
  useOpenProfile,
  useUpdateProfile,
  useChangePassword,
} from '@/store';

const MAX_AVATAR_BYTES   = 4 * 1024 * 1024; // keep in sync with lib/avatar.ts
const MIN_PASSWORD_CHARS = 8;               // keep in sync with lib/auth.ts

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="size-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function PasswordField({
  id, label, value, onChange, autoComplete,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pr-10 bg-muted/30"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/**
 * The two forms. Kept in their own component so that closing the dialog
 * unmounts them and reopening it mounts them fresh — a cancelled edit can
 * never leak into the next visit, without a reset effect.
 */
function ProfileForms({ user }: { user: AuthUser }) {
  const pending        = useProfilePending();
  const updateProfile  = useUpdateProfile();
  const changePassword = useChangePassword();

  // ── Profile form ──
  const [name,   setName]   = useState(user.name ?? '');
  const [avatar, setAvatar] = useState<File | null>(null);
  /** true once the user clicks "Remove photo" on an already-saved avatar */
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [profileError, setProfileError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Password form ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError,   setPasswordError]   = useState('');

  const pickedUrl = useMemo(() => (avatar ? URL.createObjectURL(avatar) : ''), [avatar]);
  useEffect(() => {
    return () => { if (pickedUrl) URL.revokeObjectURL(pickedUrl); };
  }, [pickedUrl]);

  const shownAvatar = pickedUrl || (avatarCleared ? '' : user.avatarUrl || '');

  const handleFile = (file: File | null) => {
    setProfileError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('The avatar must be an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setProfileError('The avatar image must be 4MB or smaller.');
      return;
    }
    setAvatar(file);
    setAvatarCleared(false);
  };

  const removePhoto = () => {
    setAvatar(null);
    setAvatarCleared(true);
    setProfileError('');
  };

  const nameChanged   = name.trim() !== (user.name ?? '');
  const avatarChanged = !!avatar || (avatarCleared && !!user.avatarUrl);
  const profileDirty  = nameChanged || avatarChanged;

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');

    const form = new FormData();
    // Only send what actually changed — an untouched field must not be
    // rewritten (and `name` is meaningful when empty: it unsets).
    if (nameChanged)  form.set('name', name.trim());
    if (avatar)       form.set('avatar', avatar);
    else if (avatarCleared) form.set('removeAvatar', 'true');

    const result = await updateProfile(form);
    if (!result.ok) {
      setProfileError(result.error || 'Could not save your profile.');
      return;
    }
    setAvatar(null);
    setAvatarCleared(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < MIN_PASSWORD_CHARS) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_CHARS} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two passwords don’t match.');
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (!result.ok) {
      setPasswordError(result.error || 'Could not change your password.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const canSubmitPassword =
    !pending &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    (!user.hasPassword || currentPassword.length > 0);

  return (
    <div className="px-6 py-5 space-y-8">

    {/* ── Profile details ── */}
    <form onSubmit={handleProfileSubmit}>
      <SectionHeader icon={UserRound} label="Profile details" />

      <div className="flex items-center gap-4 mb-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={shownAvatar ? 'Change avatar image' : 'Upload avatar image'}
          className="relative size-16 rounded-full overflow-hidden border border-dashed border-border hover:border-violet-400 transition-colors group shrink-0"
        >
          {shownAvatar ? (
            // Mixed local blob: previews and remote Sanity URLs —
            // plain <img> is intentional (next/image can't optimize blobs).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownAvatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="size-full grid place-items-center bg-muted/40">
              <Camera className="size-5 text-muted-foreground group-hover:text-violet-500 transition-colors" />
            </span>
          )}
        </button>

        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {avatar ? 'New photo selected' : shownAvatar ? 'Profile photo' : 'No profile photo'}
          </p>
          <p className="text-xs text-muted-foreground">
            Shown on your avatar and in the account menu.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              {shownAvatar ? 'Change photo' : 'Upload photo'}
            </Button>
            {shownAvatar && (
              <Button
                type="button" variant="outline" size="sm"
                onClick={removePhoto}
                className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
              >
                <X className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Display name</Label>
        <Input
          id="profile-name"
          type="text"
          autoComplete="name"
          placeholder={user.email.split('@')[0]}
          value={name}
          onChange={e => { setName(e.target.value); setProfileError(''); }}
          className="bg-muted/30"
        />
        <p className="text-xs text-muted-foreground">
          Shown in the account menu. Leave empty to fall back to your email.
        </p>
      </div>

      {profileError && (
        <p role="alert" className="text-sm text-destructive mt-3">{profileError}</p>
      )}

      <div className="mt-4">
        <Button type="submit" size="sm" disabled={pending || !profileDirty}>
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Save profile
        </Button>
      </div>
    </form>

    {/* ── Password ── */}
    <form onSubmit={handlePasswordSubmit}>
      <SectionHeader icon={KeyRound} label="Password" />

      <div className="space-y-4">
        {user.hasPassword ? (
          <PasswordField
            id="profile-current-password"
            label="Current password"
            value={currentPassword}
            onChange={v => { setCurrentPassword(v); setPasswordError(''); }}
            autoComplete="current-password"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            This account doesn&apos;t have a password yet — set one now.
          </p>
        )}

        <PasswordField
          id="profile-new-password"
          label="New password"
          value={newPassword}
          onChange={v => { setNewPassword(v); setPasswordError(''); }}
          autoComplete="new-password"
        />
        <PasswordField
          id="profile-confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={v => { setConfirmPassword(v); setPasswordError(''); }}
          autoComplete="new-password"
        />

        <p className="text-xs text-muted-foreground">
          At least {MIN_PASSWORD_CHARS} characters. You stay signed in on this device
          after changing it.
        </p>
      </div>

      {passwordError && (
        <p role="alert" className="text-sm text-destructive mt-3">{passwordError}</p>
      )}

      <Button type="submit" size="sm" className="mt-4" disabled={!canSubmitPassword}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {user.hasPassword ? 'Change password' : 'Set password'}
      </Button>
    </form>
    </div>
  );
}

export function ProfileDialog() {
  const user         = useAuthUser();
  const open         = useProfileOpen();
  const closeProfile = useCloseProfile();
  const openProfile  = useOpenProfile();

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={o => (o ? openProfile() : closeProfile())}>
      {/* Anchored below the avatar in the top-right corner, matching the
          settings panel and the toast stack. */}
      <DialogContent className="max-w-md flex flex-col gap-0 p-0 overflow-hidden top-16 bottom-auto left-auto right-3 translate-x-0 translate-y-0 max-h-[calc(100vh-5rem)] data-open:slide-in-from-top-2 data-closed:slide-out-to-top-2">
        <DialogHeader className="px-6 pt-4 pb-2 flex-shrink-0 text-left">
          <DialogTitle className="text-2xl">Your profile</DialogTitle>
          <DialogDescription className="text-xs">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <ProfileForms user={user} />
        </ScrollArea>

        <div className="flex justify-end px-6 py-3 border-t border-border flex-shrink-0">
          <Button variant="outline" size="sm" onClick={closeProfile}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

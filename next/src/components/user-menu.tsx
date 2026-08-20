'use client';

/**
 * components/user-menu.tsx
 *
 * Top-right avatar for the signed-in user. Clicking it opens a dropdown
 * with the account identity, "Profile" (name, photo and password),
 * "Settings", and "Log out"; logging out clears the session cookie,
 * resets per-user state, and confirms via toast (handled in the auth
 * slice). Every confirmation toast is anchored directly beneath this
 * avatar — see components/toaster.tsx.
 */

import { LogOut, Settings, UserRound } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuthUser, useLogout, useOpenSettings, useOpenProfile } from '@/store';

function initialsFor(email: string, name?: string): string {
  const source = (name || email.split('@')[0] || '?').trim();
  const parts  = source.split(/[\s._-]+/).filter(Boolean);
  const chars  = parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : source.slice(0, 2);
  return chars.toUpperCase();
}

export function UserMenu() {
  const user         = useAuthUser();
  const logout       = useLogout();
  const openSettings = useOpenSettings();
  const openProfile  = useOpenProfile();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity hover:opacity-85"
        >
          <Avatar>
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || user.email} />}
            <AvatarFallback>{initialsFor(user.email, user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar>
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback>{initialsFor(user.email, user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            {user.name && (
              <p className="text-sm font-medium truncate">{user.name}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {/* Profile — display name, photo and password. Opens anchored
            below the avatar, like Settings. */}
        <DropdownMenuItem onSelect={() => openProfile()}>
          <UserRound />
          Profile
        </DropdownMenuItem>
        {/* Settings lives here now (moved out of the chat input); the
            panel opens anchored below the avatar — see settings-dialog. */}
        <DropdownMenuItem onSelect={() => openSettings()}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

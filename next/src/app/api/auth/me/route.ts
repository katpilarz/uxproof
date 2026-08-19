// app/api/auth/me/route.ts — GET the signed-in user, or { user: null }.
//
// Always 200: "not signed in" is an expected state the client handles by
// showing the login screen, not an error worth a console warning.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}

// app/chat/page.tsx
// /chat → redirect to root. The full app shell (TopBar, sidebar, etc.)
// lives in src/app/page.tsx. Keeping the shell in one place avoids
// duplicating TopBar / SettingsDialog / ChatHistorySidebar across routes.

import { redirect } from 'next/navigation';

export default function ChatPage() {
  redirect('/');
}
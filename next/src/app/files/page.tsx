// app/files/page.tsx
// /files — server component by convention; the listing, summaries and
// per-file presentation generation live in components/files-view.tsx.

import { FilesView } from '@/components/files-view';

export default function FilesPage() {
  return <FilesView />;
}

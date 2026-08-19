// app/presentations/page.tsx
// /presentations — server component by convention; the client behavior
// (router, store, animation) lives in components/presentations-view.tsx.

import { PresentationsView } from '@/components/presentations-view';

export default function PresentationsPage() {
  return <PresentationsView />;
}

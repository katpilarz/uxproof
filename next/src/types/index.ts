/**
 * src/types/index.ts — v2
 *
 * CHANGES:
 *   1. Removed duplicate Message interface (was declared twice — once at
 *      top, once at bottom — relying on TypeScript interface merging).
 *   2. Removed duplicate AgentStep / AgentStatus declarations.
 *   3. AssistantMessageMeta is the single source of truth for fields
 *      shared between AIResponse and Message. Both extend it.
 *   4. presentationScope, year, quarter live on AssistantMessageMeta so
 *      they flow through unified-agent → chat route → chat-slice →
 *      Message → PresentationPreview unchanged.
 */

// ─── AI Context ───────────────────────────────────────────────────────────────

export interface AIContext {
  projectId: string;
  quarter:   string;
  year?:     number;
}

// ─── Shared assistant message metadata ────────────────────────────────────────

/**
 * Fields that flow from AIResponse all the way into Message. Either
 * type can have these set; both extend from this shape.
 */
interface AssistantMessageMeta {
  agentInfo?: {
    agent:           string;
    processingTime?: string;
  };
  processingType?:    'upload' | 'analysis' | 'comparison' | 'presentation';
  showPresentation?:  boolean;
  contextRef?: {
    project: string;
    quarter: string;
  };
  /** 'year' = full-year aggregated deck; 'quarter' = single quarter */
  presentationScope?: 'quarter' | 'year';
  /** Year picked up from the user query — forwarded to /api/presentations */
  year?:              number;
  /** Quarter picked up from the user query — forwarded when scope='quarter' */
  quarter?:           string;
}

// ─── AI response (returned from /api/chat to the client) ─────────────────────

export interface AIResponse extends AssistantMessageMeta {
  id:        string;
  role:      'assistant';
  content:   string;
  timestamp: Date;
}

// ─── Chat message (stored in client state) ───────────────────────────────────

export interface Message extends AssistantMessageMeta {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: Date;
  /** false = presentation card renders idle and waits for the user's click
   *  (upload follow-ups); undefined/true = fresh messages may auto-start. */
  presentationAutoStart?: boolean;
  attachments?: {
    name: string;
    type: string;
  }[];
  downloadUrl?:  string;
  slidePlan?:    unknown;
  intelligence?: unknown;
  isError?:      boolean;
  isTimeout?:    boolean;
}

// ─── Settings dialog ──────────────────────────────────────────────────────────

export type SettingsDialogProps = {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
};

// ─── KPI / data primitives ────────────────────────────────────────────────────

export interface KPI {
  label:  string;
  value:  string;
  change: number;
  trend:  'up' | 'down';
}

export interface DataSource {
  name:   string;
  type:   'file' | 'cms';
  status: 'ready' | 'loading';
}

// ─── Slide / presentation ─────────────────────────────────────────────────────

export interface SlideConfig {
  number:   number;
  title:    string;
  type:     'title' | 'kpi' | 'trend' | 'issue' | 'insight' | 'summary';
  content?: any[];
}

export interface PresentationSlide {
  number:   number;
  title:    string;
  type:     'title' | 'kpi' | 'trend' | 'issue' | 'insight' | 'summary';
  content?: any[];
}

export interface Presentation {
  id:             string;
  title:          string;
  quarter:        string;
  generatedDate:  Date;
  slidesCount?:   number;
  thumbnail:      string;
  slides:         number;
  status:         'completed' | 'processing' | 'draft';
}

export interface PresentationConfig {
  title:       string;
  quarter:     string;
  templateId?: string;
}

// ─── Processing progress ──────────────────────────────────────────────────────

export type ProcessingStep = {
  label:  string;
  status: 'pending' | 'processing' | 'completed';
};

export interface ProcessingProgress {
  stage:      string;
  percentage: number;
  message:    string;
}

// ─── Research insight ─────────────────────────────────────────────────────────

export interface ExecutiveInsight {
  kpis:     Array<{ label: string; value: string; change: number; trend: 'up' | 'down' }>;
  metrics:  { susScore: string; taskSuccessRate: string; npsScore: string };
  issues:   string[];
  insights: string[];
}

export interface PPTGenerationResult {
  presentationId: string;
  slidesCount:    number;
  downloadUrl:    string;
  generatedDate:  Date;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

export type ThemeProviderState = {
  theme:    Theme;
  setTheme: (theme: Theme) => void;
};

// ─── User settings ────────────────────────────────────────────────────────────

export interface UserSettings {
  theme:         'light' | 'dark';
  language:      string;
  notifications: boolean;
}

// ─── Agent execution state ────────────────────────────────────────────────────

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface AgentStep {
  agent:        string;
  status:       AgentStatus;
  started_at?:  string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  output_keys:  string[];
  error?:       string | null;
}

// ─── Streaming pipeline ───────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'completed' | 'error';

export interface StreamStep {
  name:         string;
  status:       StepStatus;
  message?:     string;
  duration_ms?: number;
  startedAt?:   number;
}

export type StreamSteps    = Record<string, StreamStep>;
export type PipelineStatus = 'idle' | 'running' | 'completed' | 'error';
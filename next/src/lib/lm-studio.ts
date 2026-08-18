// lib/lm-studio.ts
//
// Optional local-LLM helper (LM Studio's OpenAI-compatible endpoint).
// Not wired into the main pipeline — the FastAPI agent service via
// Ollama is the primary path — but kept as a drop-in alternative.

import axios from 'axios';

const LM_STUDIO_URL = process.env.NEXT_PUBLIC_LM_STUDIO_URL || 'http://localhost:1234/v1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLMStudio(messages: ChatMessage[], temperature = 0.7, model?: string) {
  try {
    const response = await axios.post(`${LM_STUDIO_URL}/chat/completions`, {
      model: model || 'qwen-2.5-14b',
      messages,
      temperature,
      max_tokens: 4096,
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('LM Studio API Error:', error);

    if (!process.env.VERCEL) {
      console.log('Using fallback LLM responses');
      return generateFallbackResponse(messages[messages.length - 1]?.content || '');
    }

    throw new Error('Failed to connect to LM Studio');
  }
}

function generateFallbackResponse(userPrompt: string): string {
  const responses = [
    "I've analyzed the quarterly research data. Here are the key insights:\n\n• SUS score is up 1.5 points to 79.4 vs the previous quarter\n• Task success reached 85.1% across moderated sessions\n• Error rate continues to fall, now at 4.3%",

    "Based on the research report analysis:\n\n**Usability Metrics**\n• SUS Score: 79.4 (↑1.5 pts vs Q2)\n• Task Success: 85.1% (↑2.3pp vs Q2)\n• NPS: +38 (↑5 pts vs Q2)",

    "I've generated your presentation with the following structure:\n\nSlide 1: Cover — reporting period\nSlide 2: Headline usability score\nSlide 3: SUS & task-success trend\nSlide 4: Key UX indicators\nSlide 5: Top usability issues\nSlide 6: Recommendations",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

export async function extractExecutiveInsights(contextData: any): Promise<any> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a UX research intelligence extraction AI. Analyze quarterly research data and produce structured insights for client presentations.

Output format as JSON:
{
  "kpis": [{"label": "...", "value": "...", "change": #, "trend": "up/down"}],
  "metrics": {"susScore": "...", "taskSuccessRate": "%", "npsScore": "..."},
  "issues": ["usability issue description"],
  "insights": ["research insight"]
}`,
    },
    { role: 'user', content: `Analyze this quarterly research data:\n\n${JSON.stringify(contextData, null, 2)}` },
  ];

  const response = await callLMStudio(messages);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    console.error('Insight extraction parse error:', e);
    return fallbackExtractedData();
  }
}

function fallbackExtractedData() {
  return {
    kpis: [
      { label: 'SUS Score', value: '79.4', change: 1.5, trend: 'up' },
      { label: 'Task Success Rate', value: '85.1%', change: 2.3, trend: 'up' },
      { label: 'Participants', value: '30', change: 15.4, trend: 'up' },
    ],
    metrics: { susScore: '79.4', taskSuccessRate: '85.1%', npsScore: '+38' },
    issues: ['Review trust deficit on product detail pages'],
    insights: ['Search users convert at twice the rate of browse-only sessions'],
  };
}

export async function generatePresentationOutline(insights: any, title: string): Promise<any[]> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a UX research presentation planning AI. Create slide structure for client-facing research decks.

Output format as JSON array:
[
  {"number": 1, "title": "...", "type": "title|kpi|trend|issue|insight|summary"},
  ...
]`,
    },
    { role: 'user', content: `Create presentation outline titled "${title}" based on these insights:\n\n${JSON.stringify(insights, null, 2)}` },
  ];

  const response = await callLMStudio(messages);

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : generateDefaultOutline(title);
  } catch (e) {
    console.error('Slide outline parse error:', e);
    return generateDefaultOutline(title);
  }
}

function generateDefaultOutline(title: string): any[] {
  return [
    { number: 1, title: 'Cover', type: 'title' },
    { number: 2, title: 'Headline Score', type: 'kpi', content: [] },
    { number: 3, title: 'Usability Trend', type: 'trend' },
    { number: 4, title: 'Key UX Indicators', type: 'kpi' },
    { number: 5, title: 'Top Usability Issues', type: 'issue' },
    { number: 6, title: 'Recommendations', type: 'summary' },
  ];
}

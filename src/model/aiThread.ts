// The AI CONVERSATION a graphic was created from — the talk turns of the Create-with-AI
// wizard step (components/wizard/ai/AiStep.tsx), captured at create so the graphic carries
// the reasoning that produced it. Persisted BESIDE `aiSpec` (the structured "More control"
// setup): SavedProject.aiThread and GraphicDoc.aiThread, both ADDITIVE OPTIONAL — rule 6 says
// additive fields never bump the version, so this rides the same sync record exactly as aiSpec
// does, no migration.
//
// Deliberately the CONVERSATION only. AiStep also keeps the heavy per-generation snapshots
// behind "↩ Bring back" (full SpxTemplates, asset data-URLs and all), but those are a
// wizard-session exploration affordance the editor has no surface to show — and persisting a
// dozen full templates per graphic would risk the storage quota. The talk turns are the
// lightweight thing that IS "the reasoning", and they feed a later refinement's context
// unchanged (same shape as ai/brainstorm ChatMessage).

export interface AiThreadMessage {
  /** 'user' = what the person said; 'assistant' = the AI's reply. */
  role: 'user' | 'assistant';
  text: string;
}

export interface AiThread {
  /** Additive-optional versioning (rule 6): bump only on a breaking shape change, migrating
   *  on read in normalizeThread. An unknown version degrades to "no thread", never a crash. */
  version: 1;
  /** The conversation, oldest first. */
  messages: AiThreadMessage[];
}

/** True when there is nothing worth carrying — the flow was prompt-only, or not AI at all. */
export function threadIsEmpty(thread: AiThread | null | undefined): boolean {
  return !thread || thread.messages.length === 0;
}

/** Read any persisted/handed-in value into the current shape (the migrate-on-read seam). */
export function normalizeThread(raw: unknown): AiThread | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<AiThread>;
  if (t.version !== 1 || !Array.isArray(t.messages)) return null; // unknown/broken: no thread
  const messages = t.messages
    .filter(
      (m): m is AiThreadMessage =>
        !!m &&
        typeof (m as AiThreadMessage).text === 'string' &&
        ((m as AiThreadMessage).role === 'user' || (m as AiThreadMessage).role === 'assistant'),
    )
    .map((m) => ({ role: m.role, text: m.text }));
  return messages.length ? { version: 1, messages } : null;
}

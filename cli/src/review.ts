// The look before a hand-in, made a gate (docs/work-specs/harness-ladder/spec.md D1). `noacg
// coverage` writes `review.json` beside `coverage.json`: every frame it produced, with an empty
// verdict, and the digest of the sources it shot. The agent opens each frame and writes its
// verdict there. `noacg record --review <review.json>` then hands in only a review that is
// complete for the graphic as it is now: every frame of the coverage beside it has a verdict, no
// verdict is left open, and the digest is the current one. A gate cannot prove the frames were
// looked at; a host that keeps the agent's trace counts the frames it opened.
//
// Pure, so the refusals are tested without a browser (cli/test/coverage.test.mjs).

export const REVIEW_FORMAT = 'noacg-review-v1';
export const REVIEW_FILE = 'review.json';

/** What review.json says to whoever opens it. */
export const REVIEW_HOW = 'Open each frame and set its verdict: "ok", or "fixed: <what>" for a frame you fixed and covered again. Anything else is open, and record --review refuses it.';

export interface ReviewFrame {
  file: string;
  verdict: string;
}

export interface Review {
  format: string;
  digest: string;
  coverage: string;
  how: string;
  frames: ReviewFrame[];
}

export interface CoverageManifest {
  digest?: string;
  frames?: Array<{ file: string }>;
}

export function reviewFor(digest: string, frames: Array<{ file: string }>): Review {
  return { format: REVIEW_FORMAT, digest, coverage: 'coverage.json', how: REVIEW_HOW, frames: frames.map((f) => ({ file: f.file, verdict: '' })) };
}

/** `ok`, `fixed: <what>`, or open (empty, or anything else: a note of a problem still there). */
export function verdictState(verdict: unknown): 'ok' | 'fixed' | 'open' {
  const v = typeof verdict === 'string' ? verdict.trim() : '';
  if (/^ok\.?$/i.test(v)) return 'ok';
  if (/^fixed:\s*\S/i.test(v)) return 'fixed';
  return 'open';
}

const short = (digest: string | undefined) => (digest ? digest.replace(/^sha256:/, '').slice(0, 12) : 'none');
const listed = (files: string[]) => (files.length > 6 ? `${files.slice(0, 6).join(', ')} and ${files.length - 6} more` : files.join(', '));

/**
 * What keeps a review from being handed in, or nothing. `coverage` is the coverage.json the review
 * names; `digest` is the graphic's digest now, when known (record knows it once the bridge read
 * the package).
 */
export function reviewProblems({ review, coverage, digest }: { review: unknown; coverage: CoverageManifest | null; digest?: string }): string[] {
  const r = review as Partial<Review> | null;
  if (!r || typeof r !== 'object' || r.format !== REVIEW_FORMAT || !Array.isArray(r.frames)) return [`not a ${REVIEW_FORMAT} file: run \`noacg coverage\` and review the frames it lists`];
  if (!coverage || !Array.isArray(coverage.frames)) return [`no coverage.json beside the review: run \`noacg coverage\` again`];
  if (!coverage.frames.length) return ['the coverage beside the review holds no frame: run `noacg coverage` again'];
  const problems: string[] = [];
  if (r.digest !== coverage.digest) problems.push(`the review (${short(r.digest)}) is not of the coverage beside it (${short(coverage.digest)})`);
  if (digest && r.digest !== digest) problems.push(`stale: the review is of ${short(r.digest)}, the graphic is now ${short(digest)}. Run \`noacg coverage\` again and review its frames`);
  const verdicts = new Map(r.frames.map((f) => [f?.file, f?.verdict]));
  const missing = coverage.frames.map((f) => f.file).filter((file) => !verdicts.has(file));
  if (missing.length) problems.push(`no verdict for ${missing.length} frame(s): ${listed(missing)}`);
  const made = new Set(coverage.frames.map((f) => f.file));
  const foreign = r.frames.map((f) => f?.file).filter((file) => !made.has(file));
  if (foreign.length) problems.push(`${foreign.length} verdict(s) for frames the coverage did not make: ${listed(foreign.map(String))}`);
  const open = r.frames.filter((f) => made.has(f?.file) && verdictState(f?.verdict) === 'open').map((f) => f.file);
  if (open.length) problems.push(`${open.length} frame(s) left open: ${listed(open)}`);
  return problems;
}

/** What a record carries of the review it was handed in with. */
export function reviewSummary(review: Review) {
  const count = (state: 'ok' | 'fixed') => review.frames.filter((f) => verdictState(f.verdict) === state).length;
  return { digest: review.digest, frames: review.frames.length, ok: count('ok'), fixed: count('fixed'), verdicts: review.frames.map((f) => ({ file: f.file, verdict: f.verdict.trim() })) };
}

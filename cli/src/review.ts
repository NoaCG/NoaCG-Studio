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
export const REVIEW_HOW = 'Open each frame and set its verdict: "ok", or "fixed: <what>" for a frame you fixed and covered again. Anything else is open, and record --review refuses it. A frame marked carried looks exactly as it did when you closed it in the last review, and keeps that verdict.';

export interface ReviewFrame {
  file: string;
  verdict: string;
  /** The frame's picture is byte for byte the one the last review in this folder closed. */
  carried?: boolean;
  /** How many coverage runs in a row before this one drew this same picture. */
  sameSince?: number;
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
  failures?: string[];
}

/** A frame drawn again exactly as the coverage before drew it: whether the review then closed it,
 *  and how many coverage runs in a row have now drawn this same picture before this one. */
export interface SameFrame {
  closed: boolean;
  sameSince: number;
}

/**
 * A fresh review of `frames`: every verdict empty, except a frame in `same` that the last review
 * closed, whose picture is the very one it closed (coverage run again after a fix: the frames the
 * fix did not touch). Those keep `ok`, marked carried, so the look after a fix is the frames that
 * changed. Every frame in `same` says for how many runs its picture has not changed, so a host
 * that keeps the agent's trace can count a look at that same picture after an earlier run.
 */
export function reviewFor(digest: string, frames: Array<{ file: string }>, same: ReadonlyMap<string, SameFrame> = new Map()): Review {
  return {
    format: REVIEW_FORMAT,
    digest,
    coverage: 'coverage.json',
    how: REVIEW_HOW,
    frames: frames.map((f) => {
      const s = same.get(f.file);
      if (!s) return { file: f.file, verdict: '' };
      return s.closed ? { file: f.file, verdict: 'ok', carried: true, sameSince: s.sameSince } : { file: f.file, verdict: '', sameSince: s.sameSince };
    }),
  };
}

/** Each frame a review lists, whether it closed it (`ok` or `fixed:`), and for how many coverage
 *  runs its picture had been the same; none for anything that is not a review. */
export function earlierFrames(review: unknown): Array<{ file: string; closed: boolean; sameSince: number }> {
  const r = review as Partial<Review> | null;
  if (!r || typeof r !== 'object' || r.format !== REVIEW_FORMAT || !Array.isArray(r.frames)) return [];
  return r.frames.filter((f) => typeof f?.file === 'string').map((f) => ({ file: f.file, closed: verdictState(f.verdict) !== 'open', sameSince: Number.isInteger(f.sameSince) ? Number(f.sameSince) : 0 }));
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
  // Renders that could not be shot are frames nobody can look at: that coverage is not complete.
  if (coverage.failures?.length) return [`the coverage could not shoot ${coverage.failures.length} render(s) (${listed(coverage.failures.map((f) => f.split(':')[0]))}): run \`noacg coverage\` again`];
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
  return { digest: review.digest, frames: review.frames.length, ok: count('ok'), fixed: count('fixed'), verdicts: review.frames.map((f) => ({ file: f.file, verdict: f.verdict.trim(), ...(f.carried ? { carried: true } : {}), ...(f.sameSince ? { sameSince: f.sameSince } : {}) })) };
}

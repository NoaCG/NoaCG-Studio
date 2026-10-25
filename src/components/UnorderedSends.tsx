/**
 * THE MARK of a page whose sends have no per-graphic order (protocol 1, hostedControl.ts
 * `sendsInOrder`): a send that commits late can air over a later one, and nothing on this page
 * sends on its own. Both React surfaces render it from here, under the on-air chip. Rare by
 * design (`seqRoadVerdict`), so it is quiet until it is there, and then it is red.
 */
export function UnorderedSends({ testId }: { testId: string }) {
  return (
    <span className="pd-onair-line pd-unordered" title="A late send can air over a later one. Reload to try again." data-testid={testId}>
      ⚠ order not guaranteed
    </span>
  );
}

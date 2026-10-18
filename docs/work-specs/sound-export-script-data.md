# Sound data in single-file exports

Sound resolver and picture selector data are embedded in an HTML script body. JSON syntax alone
does not stop HTML from closing that body, and replacing asset paths after serialization can
rewrite protected configuration values. Keep generated data inert and preserve its logical values.

The change is limited to the sound inlining boundary. Authored JavaScript remains executable and
keeps its existing image-path substitution. This is not a general template sanitizer or a claim
that a hostile audio file can reach this boundary through normal production import.

Acceptance criteria:

- Resolver keys and values containing closing-script or script-comment sequences remain data.
- Picture selectors resolve to embedded images, while binding and topology metadata stay intact.
- No raw asset substitution runs over the generated JSON after it has been encoded.
- Ordinary base64 and Blob audio resolve unchanged; authored JavaScript and no-sound templates work.
- A browser loads the actual composed HTML without injected markup or script execution, and the
  existing PNG packaging case still plays sound and disposes it.

Use focused Node regressions, a bounded browser selection, and the normal CI and merge queue.
Local execution is authorized by the owner for this remediation; full validation stays in Actions.

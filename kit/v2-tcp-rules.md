### vMix command replies after dispatch

The latest independent review found a V2 product defect in command outcome reporting. A Load that may have reached vMix can be reported as a refusal even though the overlay may have changed. The previously reviewed pairing behavior is part of the baseline for this focused repair.

- A pending FUNCTION accepts only a complete UTF-8 line terminated by CRLF, with the FUNCTION command word, an OK or ER status, and optional response text. OK still requires the existing state readback before Bridge reports an observed effect. ER preserves the explicit refusal.
- If Bridge sends a command and receives an invalid FUNCTION reply, the result is uncertain. Bridge closes the ambiguous connection so later bytes cannot answer another request. It sends the command only once. A later separate request may use a fresh connection.
- A Load that already verified Browser creation keeps that fact when Overlay In has an uncertain outcome. The reply leaves placement unresolved and asks the operator to inspect vMix before trying again. Unsent commands, confirmed refusals, and observed outcomes retain their existing distinctions.
- Use focused fake-mixer cases for complete and invalid replies, the one-send rule, and placement uncertainty with confirmed creation. Follow with the normal package and real-vMix proof in an owned blank session. Program, Preview and transitions stay under the mixer operator's control.

Reference: https://www.vmix.com/help29/TCPAPI.html

The independent rules review clarified the reply boundary. Accept exact space-delimited FUNCTION and OK or ER tokens and optional UTF-8 response text. Normal TCP fragmentation and unrelated event lines do not alter the result. Reject invalid UTF-8, missing CRLF, embedded CR, and unknown status in a FUNCTION reply. Once rejected, discard the rest of that connection's buffer, including any valid-looking line in the same chunk. The next separate request can open a fresh connection.

The regression fake applies In before it emits the invalid reply. Check that Browser creation is reported, placement stays uncertain, and there is one dispatch. Confirm that a separate read reconnects. Check valid refusal detail and retain existing OK readback cases.

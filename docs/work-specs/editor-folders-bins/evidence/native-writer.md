# Unsupported source stays read-only at the writer boundary

Command: `node --test scripts/editor-organization.test.mjs`.

The added assertion called `writeOrganization` directly against an unknown
version, unknown field and invalid folder tree. Before the fix, the first case
failed with `AssertionError [ERR_ASSERTION]: Missing expected exception`:
3 passed, 1 failed. The writer had replaced the unsupported header with v1.

The writer now reads and validates the existing source before replacing it.
The same four native cases pass, covering every unsupported input in the loop.
Focused ESLint passed. This supplements the existing source-format receipt;
it proves the bounded source reader/writer, not rendered UI or a receiving host.

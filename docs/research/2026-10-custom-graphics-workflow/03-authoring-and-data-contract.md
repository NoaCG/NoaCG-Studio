# One contract, three existing authoring doors

No new renderer, parallel manifest, source polling inside templates, or relational Show.data engine is proposed. SPX/NOACG_ANIM, SVG BehaviourRecipe, and OGraf/GDD remain the authorities. The CSV files and mapping tables here are research examples, not a new product runtime format.

| Capability | Existing behavior | Inference / declaration and minimal extension |
|---|---|---|
| Field ID, label, type, default | SPX DataFields use fN, ftype, title, value. Generic controls read these. | IDs/types/defaults explicitly declared. Text/image node discovery safely suggests candidates; numeric-looking samples only suggest number type. Operator confirms. |
| Stable identity on reimport | SVG binding numbers text then images by selected order. | Preserve IDs with an explicit old→new node review. Do not infer identity from position or a similar label. Reordered selection must not silently repoint a published binding. |
| Number bounds | GDD supports minimum/maximum/multipleOf. Native basic SPX parsing does not preserve a general equivalent. Existing ± helper parses integers. | Proposal: preserve optional numeric constraints through the existing native field metadata/serialization and map to GDD. Define decimal steps separately; do not apply integer score nudges to vote share. Same validation in UI, imported defaults and adapter. |
| SVG/DOM linkage | Native field ID resolves to matching DOM node. SVG binder renames nodes and repairs references. | Explicit selected node. Missing IDs fail the imported-design gate. Outlines require a positioned replacement field, never guessed OCR. |
| Image references | SPX filelist and GDD file-path/image-path. IMG src and SVG image href update. Package contains assets; foreign scope constrains fetches. | Mapper confirms a cell's asset name → approved library/package asset. Proposed host resolver validates type/size/decode, caches, and only then writes. External URL ingestion is a host task, not a template fetch. Failed image retention requires this extension. |
| Lists | Scalar arrays become newline strings; list recipe consumes one string. Object arrays are not bindable whole-field values. | A one-column list is existing shape. Multi-column source mapping to distinct scalar slots is Option A; declarative multi-column repeat rendering is Option B. No fake pipe join when artwork expects separate fields. |
| Bracket relationships | No bracket recipe. Authored template can expose 15×fixed scalar fields. | Upstream explicitly materializes match slots and progression. Optional table-slots/bracket recipe defines columns, slot keys and visual roles within BehaviourRecipe. It does not compute tournament rules in Show.data. |
| Operator actions | NOACG_ANIM.machine controls: payload, adjust, set, add, remove. State fields report current state. OGraf customActions are separate from updateAction. | Explicit event transitions and payload declarations. No source data can name/invoke an action. Machine buttons require valid transitions; OGraf has no equivalent state graph guarantee. |
| Package compatibility | Native packs carry templates, inline assets, layers and cue values. OGraf contract derives from manifest/schema. | New optional mapping hints can be additive but require an agreed serialized home. Source IDs, credentials and endpoint access remain production-specific. Type/ID changes require compatibility review and republish under today's API behavior. |

## Exact example binding

The fixture uses the **existing** structure, not a proposed schema:

```json
{
  "Election Party Board": {
    "f1": "election.parties.KOK.votes_text"
  },
  "Election Candidate Card": {
    "f2": "election.candidates.FI2027_02_101.votes_text",
    "f3": "election.candidates.FI2027_02_101.status"
  }
}
```

Aino's f0 name, f1 party/district and f4 portrait are prepared cue values. The candidate key includes election, district and ballot number; ballot 101 in another district is a different candidate. This is a dictionary key supported by existing dot paths, not a new `table[key=id]` expression in ProductionBindings. A proposed Sheet adapter validates uniqueness and materializes that dictionary. Upstream source IDs must be mapped deliberately; synthetic IDs are not asserted as official IDs.

The whole party table does not bind to a JSON object. Each field binds to a leaf; the adapter supplies all leaves in one coherent patch. The party board has 50 fields, five per party. The ticker takes a scalar array or newline string; empty list writes `""`, not `[]` or `null`. Sending null removes a tree key without clearing the rendered field.

## Minimal proposed SVG behavior extension

Keep BehaviourRecipe as the mechanism. Before adding any interface member, qualify whether existing perRow roles can express the chosen slots. If not, add optional declared table columns (key/type/role), fixed row keys and explicit slot-role mapping to the existing recipe metadata and NOACG_BEHAVIOUR serialization. Missing data leaves a slot at its last validated value; explicit clear is separately typed. Highlight/crown events remain machine controls. No new event fields in Sheet rows.

## Compatibility examples

- Rename visible label “Score” → “Votes” while f2 remains number: existing binding stays on f2; human confirms semantics.
- Move the logo node in SVG with its identity preserved: retain field ID and binding; visual preview required.
- Delete f2 or replace number with image: report an incompatible field; keep the published known-good version until repaired and republished.
- Add optional f5: old cues remain valid with its default; do not connect it merely because another source has an equal label.
- Rename a graphic: binding-key migration must follow the existing production rename path; test it explicitly, rather than relying on plain dictionary rename.

Evidence is linked in [01](01-current-state-evidence.md). Full authoring artifacts are the four [native template fixtures](election/templates/), [bindings](election/bindings.json), [prepared cue](election/prepared-cues.json), shared [SVG](fixtures/harbour-overlay.svg), and [15-match table](fixtures/Matches.csv). The election sample uses basic native fields/lifecycle functions; it does not claim NOACG_ANIM custom-action or SVG wizard equivalence has been executed.

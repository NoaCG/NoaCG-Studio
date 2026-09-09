---
kind: agent
date: 2026-09-09
---
# The render tier nobody paid for is now called "granted"

The widest render cap table was called `paid`. Nothing has ever been sold and no billing is
planned, so the name was false about what the thing is: you reach that tier by an admin assigning
you a plan, or by your e-mail domain matching one - a school grant, a heavy-use exception. It is
now called `granted`, which is what actually happens. The caps behind it did not move.

The name was not buried in a type. The admin Plans editor builds its tier dropdown straight from
the render limits table, so an operator setting up a school's plan was picking "paid" on a product
with no way to pay.

## The route, under a minute

`/admin` (sign in on the main origin first, then open it) -> the **Plans** tab -> click any plan,
or **New plan**, to open the editor.

**What to look at.** The **Render tier** dropdown offers exactly `anonymous`, `free`, `granted`,
and no `paid`. Pick `granted`, save, reopen the plan and confirm it held. The Plans table's render
tier column shows `granted` for any plan that used to say `paid`; on a fresh instance every plan
says `free`, which is the seeded default. Migration 0055 rewrote the stored rows and the
`render_jobs` check constraint, so also confirm a cloud render still starts and completes for a
signed-in account. Branch `claude/render-tier-granted`.

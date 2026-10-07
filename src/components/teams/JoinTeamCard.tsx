// THE JOIN DOOR ON HOME - the place a join code is typed (docs/TEAMS_PLAN.md §6, "Stage 4b").
//
// Before this, a code could only be redeemed by somebody already holding the LINK, because
// `JoinTeamDialog` was reachable from `#/join-team/<code>` alone; the owner held a code and could
// not find anywhere to use it. This card is that place: a signed-in account types (or pastes) a
// code and lands on the same join dialog a link opens, so there is one join errand, not two.
//
// It hangs off the productions list rather than off a production, because the person who needs it
// most - a student with a teacher's code - owns no production yet. That relaxes §6's "the word
// team appears only after the door is opened" for SIGNED-IN accounts only: offline and signed out
// the caller renders nothing, behind `useTeamsAvailable()` like every other team surface, and
// `e2e/auth.spec.ts` pins it absent there.
//
// It carries no sentence: the title, the field's placeholder and the button say what it is for.
// Starting a team is a production's Share, on the production card's menu, so it is not told here.

import { useState } from 'react';
import { useRouter } from '../../app/router';
import { joinCodeFrom } from '../../backend/teams';
import { IconUsers } from '../icons';

export default function JoinTeamCard() {
  const navigate = useRouter((s) => s.navigate);
  const [text, setText] = useState('');
  const code = joinCodeFrom(text);
  // The dialog asks the one remaining question (the name teammates see) and says what happened.
  // The field empties as it opens, so coming back after the join does not look like nothing
  // happened.
  const open = () => {
    if (!code) return;
    setText('');
    navigate({ view: 'join-team', code });
  };

  return (
    <div className="prod-card prod-card-new team-join-card" data-testid="join-team-card">
      <strong><IconUsers size={15} /> Join a team</strong>
      <div className="spacer" />
      <input
        value={text}
        placeholder="Join code or link…"
        aria-label="Join code or link"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
        data-testid="join-team-card-code"
      />
      <button disabled={!code} onClick={open} data-testid="join-team-card-go">
        Join…
      </button>
    </div>
  );
}

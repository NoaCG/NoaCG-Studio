// True when the signed-in user is a community moderator, who reviews community packs. The app has
// no auth store, so this fetches on demand via the is_moderator() RPC and re-checks whenever auth
// changes.
// Returns false offline / logged out / for a non-moderator, so it can gate a UI affordance without
// ever showing it in the offline app.

import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import { subscribeAuth } from '../backend/auth';
import { getSupabase } from '../backend/supabase';

async function isModerator(): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return false;
  const { data } = await sb.rpc('is_moderator');
  return data === true;
}

export function useIsModerator(): boolean {
  const [moderator, setModerator] = useState(false);

  useEffect(() => {
    if (!isBackendConfigured()) return;
    let alive = true;
    const unsub = subscribeAuth((state) => {
      if (state.status === 'signed-in' && state.user) {
        void isModerator().then((m) => {
          if (alive) setModerator(m);
        });
      } else if (alive) {
        setModerator(false);
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return moderator;
}

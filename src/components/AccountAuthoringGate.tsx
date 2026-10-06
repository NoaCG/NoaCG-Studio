import { useEffect, useState, type ReactNode } from 'react';
import { canAuthorAccount } from '../model/durableStore';

export function useAccountAuthoring(): boolean {
  const [allowed, setAllowed] = useState(canAuthorAccount);
  useEffect(() => {
    const update = () => setAllowed(canAuthorAccount());
    window.addEventListener('noacg-account-authoring', update);
    return () => window.removeEventListener('noacg-account-authoring', update);
  }, []);
  return allowed;
}

/** Only authoring surfaces pause. Production transport and account recovery remain usable. */
export default function AccountAuthoringGate({ children }: { children: ReactNode }) {
  const allowed = useAccountAuthoring();
  return <div style={{ display: 'contents' }} inert={!allowed} data-account-authoring={allowed ? 'enabled' : 'paused'}>{children}</div>;
}

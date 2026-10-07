import { useLayoutEffect, useRef, useState } from 'react';

/** Input keys belong to the name editor; Enter/blur commit once, Escape cancels. */
export default function InlineOrganizationName({ name, label, commit, cancel }: { name: string; label: string; commit: (name: string) => void; cancel: () => void }) {
  const [value, setValue] = useState(name), finished = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { input.current?.select(); }, []);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) commit(value); else cancel();
  };
  return <input className="ef-organization-name" aria-label={label} value={value} autoFocus
    ref={input} onChange={event => setValue(event.target.value)}
    onBlur={() => finish(true)} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finish(event.key === 'Enter'); }
    }} />;
}

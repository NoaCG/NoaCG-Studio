import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import {
  addOptionRow,
  cleanOptions,
  isKnownType,
  moveItem,
  optionLetter,
  pasteOptionRows,
  questionProblem,
  QUESTION_LIMITS,
  removeOptionRow,
  startOptionRows,
  type QuestionType,
  type ShowQuestion,
} from '../../model/questions';
import { mountJoinSurface, type JoinSurfaceHandle } from '../../audience/joinSurface';
import type { AudienceBrand, JoinView } from '../../audience/audienceTypes';
import { IconGrip } from '../icons';
import LibMenu from './LibMenu';

/**
 * THE QUESTIONS AREA of the Interaction tab (docs/work-specs/interaction/spec.md, "Screens" 1):
 * one row per question with its type, text and answer count, the Live on phones mark on the one
 * phones are answering, Go live or Stop, and a menu. Pressing a row SELECTS it to look at, which
 * changes nothing on phones or Program (R12): selection is the workspace's screen state.
 *
 * Props only. Every press calls back; the workspace owns the list's writes (model/shows.ts
 * `setShowQuestions`) and the provider's Go live, Stop and Clear results.
 */

export interface QuestionRowState {
  live: boolean;
  answers: number;
  locked: boolean;
}

/** What a studio preview says when someone presses Send or Vote in it: it is never a phone. */
export const PREVIEW_REFUSAL = 'This is your preview. Send from a phone to test it.';

/** What each kind of question gives the production to air (live-production-reliability P3). */
const RESULTS: Record<QuestionType, string> = {
  choice: 'Results: counts and shares per option, for a vote board.',
  open: 'Results: answers arrive as messages, for a message card.',
  word: 'Results: each word counted, for a word cloud.',
};

/** Where the phone preview's look comes from: the production's own page. */
export interface ComposerPhone {
  productionName: string;
  brand: AudienceBrand | null;
}

/** What phones would show if this draft went live now, as the join resolve would hand it over. */
function draftView(type: QuestionType, text: string, rows: readonly string[], allowChange: boolean, phone: ComposerPhone): JoinView {
  const words = text.trim();
  return {
    productionName: phone.productionName,
    brand: phone.brand,
    state: {
      open: true,
      mode: type === 'choice' ? 'poll' : type === 'open' ? 'question' : 'word',
      prompt: words,
      round: {
        id: 'draft',
        kind: type === 'choice' ? 'poll' : type,
        questionId: null,
        revision: 0,
        question: words,
        options: type === 'choice' ? cleanOptions(rows) : [],
        correctOption: null,
        openedAt: '',
        closedAt: null,
        allowChange,
      },
      presenter: { current: null, next: null },
    },
    mine: [],
    myVote: null,
  };
}

/**
 * THE DRAFT ON A PHONE: the public page's own renderer (audience/joinSurface.ts), read-only, fed
 * the draft as a phone would be fed it live, so what the operator sees while writing is what the
 * room will see. Mounted once; each change of the draft re-reads it.
 */
function DraftPhone({ view }: { view: JoinView }) {
  const host = useRef<HTMLDivElement | null>(null);
  const surface = useRef<JoinSurfaceHandle | null>(null);
  const latest = useRef(view);
  latest.current = view;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const refuse = async () => ({ ok: false, error: PREVIEW_REFUSAL });
    surface.current = mountJoinSurface(el, { load: async () => latest.current, submit: refuse, vote: refuse }, { poll: false });
    return () => {
      surface.current?.destroy();
      surface.current = null;
    };
  }, []);
  useEffect(() => {
    surface.current?.refresh();
  }, [view]);
  // The host is a child of the frame, as in the workspace's own preview: `.nj` brings its own width.
  return (
    <div className="pd-aud-preview-frame pd-aud-composer-frame">
      <div ref={host} data-testid="question-preview" />
    </div>
  );
}

/**
 * A vote's OPTIONS, one row each (owner, 2026-11-23): its letter, its words, a handle to drag it by,
 * and remove. Enter adds a row below, Backspace in an empty row removes it, Alt+Up and Alt+Down move
 * it, and a paste of several lines makes several rows. Locked, the rows are only read.
 */
function OptionRows({ rows, locked, onChange }: { rows: string[]; locked: boolean; onChange: (rows: string[]) => void }) {
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const grips = useRef<(HTMLButtonElement | null)[]>([]);
  // Where focus goes once the rows it is about have rendered.
  const focusNext = useRef<{ at: number; grip: boolean } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [pasted, setPasted] = useState<string | null>(null);
  const id = useId();
  const { maxOptions, minOptions } = QUESTION_LIMITS;

  useLayoutEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    (next.grip ? grips.current[next.at] : fields.current[next.at])?.focus();
  }, [rows]);

  const change = (next: string[] | null, focus?: { at: number; grip?: boolean }) => {
    if (!next) return;
    setPasted(null);
    if (focus) focusNext.current = { at: focus.at, grip: focus.grip ?? false };
    onChange(next);
  };
  const move = (from: number, to: number, grip: boolean) => {
    if (to < 0 || to >= rows.length || to === from) return;
    change(moveItem(rows, from, to), { at: to, grip });
  };

  const onFieldKey = (e: KeyboardEvent<HTMLInputElement>, at: number) => {
    // Enter and Backspace inside an input method's composition belong to the composition.
    if (e.nativeEvent.isComposing) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(at, e.key === 'ArrowUp' ? at - 1 : at + 1, false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      change(addOptionRow(rows, at), { at: at + 1 });
    } else if (e.key === 'Backspace' && rows[at] === '' && at > 0) {
      e.preventDefault();
      // At the fewest a vote takes, the row stays and focus still steps back.
      const fewer = removeOptionRow(rows, at);
      if (fewer) change(fewer, { at: at - 1 });
      else fields.current[at - 1]?.focus();
    }
  };
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    move(at, e.key === 'ArrowUp' ? at - 1 : at + 1, true);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, at: number) => {
    const clip = e.clipboardData.getData('text');
    const input = e.currentTarget;
    const value = input.value;
    const made = pasteOptionRows(rows, at, value.slice(0, input.selectionStart ?? value.length) + clip + value.slice(input.selectionEnd ?? value.length));
    if (!made) return;
    e.preventDefault();
    change(made.rows, { at: made.focus });
    if (made.dropped > 0) setPasted(`Only ${maxOptions} options fit; ${made.dropped} left out.`);
  };
  const onDrop = (e: DragEvent<HTMLLIElement>, at: number) => {
    e.preventDefault();
    if (dragFrom !== null) move(dragFrom, at, true);
    setDragFrom(null);
  };

  return (
    <div className="pd-aud-opts-area">
      <ol className="pd-aud-opts" data-testid="question-options">
        {rows.map((row, at) => {
          const letter = optionLetter(at);
          return (
            <li
              // Rows are their place in the list: every field is controlled, and focus is placed
              // after each change, so nothing rides on an element staying with its words.
              key={at}
              className={`pd-aud-opt${dragFrom === at ? ' dragging' : ''}`}
              onDragOver={(e) => {
                if (dragFrom !== null) e.preventDefault();
              }}
              onDrop={(e) => onDrop(e, at)}
              data-testid="question-option-row"
            >
              {!locked && (
                <button
                  type="button"
                  className="pd-aud-opt-grip"
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(at);
                    e.dataTransfer.effectAllowed = 'move';
                    // A custom type, so a drop on a text field never types anything into it.
                    e.dataTransfer.setData('application/x-noacg-option', letter);
                    const li = e.currentTarget.closest('li');
                    if (li) e.dataTransfer.setDragImage(li, 12, 12);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  onKeyDown={(e) => onGripKey(e, at)}
                  ref={(el) => {
                    grips.current[at] = el;
                  }}
                  aria-label={`Move option ${letter}`}
                  title="Drag, or Alt+Up and Alt+Down"
                  data-testid="question-option-grip"
                >
                  <IconGrip size={14} />
                </button>
              )}
              <label className="pd-aud-opt-key" htmlFor={`${id}-${at}`}>
                {letter}
              </label>
              <input
                id={`${id}-${at}`}
                type="text"
                value={row}
                readOnly={locked}
                maxLength={QUESTION_LIMITS.option}
                aria-label={`Option ${letter}`}
                ref={(el) => {
                  fields.current[at] = el;
                }}
                onChange={(e) => change(rows.map((r, i) => (i === at ? e.target.value : r)))}
                onKeyDown={locked ? undefined : (e) => onFieldKey(e, at)}
                onPaste={locked ? undefined : (e) => onPaste(e, at)}
                data-testid="question-option"
              />
              {!locked && (
                <button
                  type="button"
                  className="pd-aud-opt-remove"
                  disabled={rows.length <= minOptions}
                  onClick={() => change(removeOptionRow(rows, at), { at: Math.max(0, at - 1) })}
                  aria-label={`Remove option ${letter}`}
                  title={rows.length <= minOptions ? 'A vote needs two options' : undefined}
                  data-testid="question-option-remove"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!locked && (
        <div className="pd-aud-opts-foot">
          <button
            type="button"
            disabled={rows.length >= maxOptions}
            onClick={() => change(addOptionRow(rows, rows.length - 1), { at: rows.length })}
            data-testid="question-option-add"
          >
            + Option
          </button>
          {/* The count is news only near the limit. */}
          {rows.length >= maxOptions - 2 && (
            <span className="hint" data-testid="question-option-count">
              {rows.length} of {maxOptions}
            </span>
          )}
          {pasted && (
            <span className="hint" role="status" data-testid="question-option-dropped">
              {pasted}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** The composer: a type is chosen first, then the words. Editing reuses it with the type fixed. A
 *  question that is live or answered (`locked`) is shown, never changed. */
export function QuestionComposer({
  editing,
  locked = false,
  phone,
  onSave,
  onCancel,
}: {
  editing: ShowQuestion | null;
  locked?: boolean;
  phone: ComposerPhone;
  onSave: (type: QuestionType, text: string, options: string[], allowChange: boolean) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<QuestionType | null>(editing && isKnownType(editing.type) ? editing.type : null);
  const [text, setText] = useState(editing?.text ?? '');
  const [rows, setRows] = useState(() => startOptionRows(editing?.options));
  const [allowChange, setAllowChange] = useState(editing?.allowChange !== false);
  const view = useMemo(() => (type ? draftView(type, text, rows, allowChange, phone) : null), [type, text, rows, allowChange, phone]);
  const problem = type ? questionProblem(type, text, rows) : null;
  if (!type || !view) {
    return (
      <div className="pd-aud-composer" data-testid="question-composer">
        <span className="hint">What kind of question?</span>
        <button onClick={() => setType('open')} data-testid="question-type-open">
          Open
        </button>
        <button onClick={() => setType('choice')} data-testid="question-type-choice">
          Multiple choice
        </button>
        <button onClick={() => setType('word')} data-testid="question-type-word">
          Word
        </button>
        <button onClick={onCancel} data-testid="question-cancel">
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="pd-aud-composer pd-aud-composer--write" data-testid="question-composer">
      <div className="pd-aud-composer-fields">
        <input
          type="text"
          value={text}
          readOnly={locked}
          maxLength={QUESTION_LIMITS.text}
          placeholder={type === 'choice' ? 'Who wins tonight?' : type === 'word' ? 'Sum up tonight in one word' : 'What should we ask the guest?'}
          aria-label="Question"
          onChange={(e) => setText(e.target.value)}
          data-testid="question-text"
        />
        {type === 'choice' && <OptionRows rows={rows} locked={locked} onChange={setRows} />}
        {type === 'choice' && (
          <label className="pd-aud-check" data-testid="question-allow-change-row">
            <input
              type="checkbox"
              checked={allowChange}
              disabled={locked}
              onChange={(e) => setAllowChange(e.currentTarget.checked)}
              data-testid="question-allow-change"
            />
            Allow changing a vote
          </label>
        )}
        <div className="pd-aud-round-actions">
          <button
            className="primary"
            disabled={locked || problem !== null}
            onClick={() => onSave(type, text, cleanOptions(rows), allowChange)}
            data-testid="question-save"
          >
            {editing ? 'Save' : 'Add question'}
          </button>
          <button onClick={onCancel} data-testid="question-cancel">
            Cancel
          </button>
          {problem && text.trim() !== '' && <span className="hint">{problem}</span>}
        </div>
      </div>
      <div className="pd-aud-composer-phone">
        <DraftPhone view={view} />
        <p className="hint" data-testid="question-results">
          {RESULTS[type]}
        </p>
      </div>
    </div>
  );
}

export function QuestionList({
  questions,
  states,
  selectedId,
  busy,
  armedClear,
  onSelect,
  onGoLive,
  onStop,
  onEdit,
  onMove,
  onDuplicate,
  onClear,
  onDelete,
  onDisarm,
}: {
  questions: ShowQuestion[];
  states: Record<string, QuestionRowState>;
  selectedId: string | null;
  busy: boolean;
  armedClear: string | null;
  onSelect: (id: string) => void;
  onGoLive: (question: ShowQuestion) => void;
  onStop: () => void;
  onEdit: (question: ShowQuestion) => void;
  onMove: (id: string, to: number) => void;
  onDuplicate: (question: ShowQuestion) => void;
  onClear: (question: ShowQuestion) => void;
  onDelete: (question: ShowQuestion) => void;
  /** The menu closed: an armed Clear results stands down. */
  onDisarm: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const shut = () => {
    setMenuFor(null);
    onDisarm();
  };
  const close = (run: () => void) => () => {
    shut();
    run();
  };
  // Keyboard order: Alt with the up or down arrow moves the focused row, as a drag would.
  const onKey = (e: KeyboardEvent<HTMLLIElement>, id: string, at: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onMove(id, e.key === 'ArrowUp' ? at - 1 : at + 1);
    }
  };
  const onDrop = (e: DragEvent<HTMLLIElement>, at: number) => {
    e.preventDefault();
    if (dragging) onMove(dragging, at);
    setDragging(null);
  };
  if (questions.length === 0) {
    return (
      <p className="hint pd-data-empty" data-testid="question-list-empty">
        No questions yet. Write them before air, then put one live when phones should answer it.
      </p>
    );
  }
  return (
    <ol className="pd-aud-qlist" data-testid="question-list">
      {questions.map((q, at) => {
        const state = states[q.id] ?? { live: false, answers: 0, locked: false };
        const known = isKnownType(q.type);
        return (
          <li
            key={q.id}
            className={`pd-aud-q${selectedId === q.id ? ' selected' : ''}${state.live ? ' live' : ''}${dragging === q.id ? ' dragging' : ''}`}
            tabIndex={0}
            aria-selected={selectedId === q.id}
            draggable
            onDragStart={(e) => {
              setDragging(q.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, at)}
            onDragEnd={() => setDragging(null)}
            onClick={() => onSelect(q.id)}
            onKeyDown={(e) => onKey(e, q.id, at)}
            title="Alt+Up or Alt+Down moves it"
            data-testid={`question-${q.id}`}
          >
            <span className="pd-aud-q-type" data-testid="question-type">
              {q.type === 'choice' ? 'Vote' : q.type === 'open' ? 'Open' : q.type === 'word' ? 'Word' : 'Newer'}
            </span>
            <span className="pd-aud-q-text" data-testid="question-row-text">
              {q.text}
            </span>
            <span className="pd-aud-q-count" title="Answers" data-testid="question-count">
              {state.answers}
            </span>
            {state.live && (
              <span className="pd-aud-q-live" data-testid="question-live">
                Live on phones
              </span>
            )}
            <span className="pd-aud-q-actions" onClick={(e) => e.stopPropagation()}>
              {state.live ? (
                <button className="danger" disabled={busy} onClick={onStop} data-testid="question-stop">
                  Stop
                </button>
              ) : (
                <button className="primary" disabled={busy || !known} onClick={() => onGoLive(q)} data-testid="question-go-live">
                  Go live
                </button>
              )}
              <span className="lib-menu-host">
                <button
                  aria-haspopup="menu"
                  aria-expanded={menuFor === q.id}
                  onClick={() => (menuFor === q.id ? shut() : setMenuFor(q.id))}
                  title="More"
                  data-testid="question-more"
                >
                  ⋯
                </button>
                <LibMenu open={menuFor === q.id} onClose={shut} testid="question-menu">
                  <button role="menuitem" disabled={state.locked} title={state.locked ? 'Live or answered: its words stay as asked' : undefined} onClick={close(() => onEdit(q))} data-testid="question-edit">
                    Edit
                  </button>
                  <button role="menuitem" disabled={at === 0} onClick={close(() => onMove(q.id, at - 1))} data-testid="question-move-up">
                    Move up
                  </button>
                  <button role="menuitem" disabled={at === questions.length - 1} onClick={close(() => onMove(q.id, at + 1))} data-testid="question-move-down">
                    Move down
                  </button>
                  <button role="menuitem" disabled={!known} onClick={close(() => onDuplicate(q))} data-testid="question-duplicate">
                    Duplicate
                  </button>
                  {/* Two presses: the first arms it and the menu stays open on the second. */}
                  <button
                    role="menuitem"
                    className={armedClear === q.id ? 'armed' : ''}
                    disabled={state.live || busy}
                    title={state.live ? 'Stop the question first' : undefined}
                    onClick={() => {
                      if (armedClear === q.id) setMenuFor(null);
                      onClear(q);
                    }}
                    data-testid="question-clear"
                  >
                    {armedClear === q.id ? 'Press again to clear its results' : 'Clear results'}
                  </button>
                  <button role="menuitem" disabled={busy} onClick={close(() => onDelete(q))} data-testid="question-delete">
                    Delete
                  </button>
                </LibMenu>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

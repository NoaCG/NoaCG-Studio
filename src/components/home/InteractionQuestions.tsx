import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { cleanOptions, isKnownType, questionProblem, QUESTION_LIMITS, type QuestionType, type ShowQuestion } from '../../model/questions';
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

/** The composer: a type is chosen first, then the words. Editing reuses it with the type fixed. */
export function QuestionComposer({
  editing,
  onSave,
  onCancel,
}: {
  editing: ShowQuestion | null;
  onSave: (type: QuestionType, text: string, options: string[]) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<QuestionType | null>(editing && isKnownType(editing.type) ? editing.type : null);
  const [text, setText] = useState(editing?.text ?? '');
  const [optionsText, setOptionsText] = useState((editing?.options ?? []).join('\n'));
  const options = optionsText.split('\n');
  const problem = type ? questionProblem(type, text, options) : null;
  if (!type) {
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
    <div className="pd-aud-composer" data-testid="question-composer">
      <input
        type="text"
        value={text}
        maxLength={QUESTION_LIMITS.text}
        placeholder={type === 'choice' ? 'Who wins tonight?' : type === 'word' ? 'Sum up tonight in one word' : 'What should we ask the guest?'}
        aria-label="Question"
        onChange={(e) => setText(e.target.value)}
        data-testid="question-text"
      />
      {type === 'choice' && (
        <textarea
          value={optionsText}
          rows={4}
          placeholder={'One option per line\nTwo to eight'}
          aria-label="Options"
          onChange={(e) => setOptionsText(e.target.value)}
          data-testid="question-options"
        />
      )}
      <div className="pd-aud-round-actions">
        <button className="primary" disabled={problem !== null} onClick={() => onSave(type, text, cleanOptions(options))} data-testid="question-save">
          {editing ? 'Save' : 'Add question'}
        </button>
        <button onClick={onCancel} data-testid="question-cancel">
          Cancel
        </button>
        {problem && text.trim() !== '' && <span className="hint">{problem}</span>}
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

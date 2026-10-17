# root/render-old-code-editor-route-never

Rule: `root/render-old-code-editor-route-never`. Recorded 2026-09-24 on `claude/a-close-old-editor` at 2ef023324.

Owner goal of 2026-09-24 (night wave, goal 3): nobody can reach the old code editor any more, and no test depends on it. Advanced mode lived in the browser's localStorage (spx-gfx-prefs), not the account, so one tick on a shared classroom computer sent every later student into AppShell; the owner reproduced it on noacg.studio the same day, where the wizard's X opened the old editor because App.tsx rewound a wizard close to { view: 'editor' } whenever isAdvancedMode() was true. The 2026-09-21 work (commits 172bca9fd and e59b50b47) had only hidden the doors behind that setting. Row A of the 2026-09-24 night wave removed the setting, versioned prefs to v2 with a migrate-on-read that drops the flag, removed every door (Blank card and step, Finish's code-editor door, Home's Continue editing, the control page's Advanced branch, EditorFoundation's Existing editor, VideoAppShell's editor branch) and routes '' / #/ / unknown hashes to Home and #/graphic/<id> to the control page. App.tsx no longer imports AppShell at all.

## 2026-10-17: the shell is deleted

The first deletion of docs/work-specs/codebase-lean/spec.md removed AppShell.tsx, WorkspaceDock.tsx,
CodeEditor.tsx, SidePanel.tsx and src/teach/ (seven files, 1,230 lines) on main c1e02c6e9. Nothing
had imported them since the 2026-09-24 close, so the rule's "keep its source until the new editor
has taken over" clause is spent and its text now says the shell never comes back; its scope drops
the deleted file. e2e/no-old-editor.spec.ts keeps every test, including the module-request guard,
and contracts/retired.json lists the shell so a contract that instructs it again fails the build.

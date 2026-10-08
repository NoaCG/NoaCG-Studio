import { create } from 'zustand';

/**
 * Tiny UI store for the on-demand sign-in dialog. Any feature gate (topbar button, AI panel,
 * community, publish) calls openSignIn(reason) and the dialog opens over the app — the app itself
 * is never walled. The optional reason line tells the user WHY they are being asked to sign in.
 */
interface AuthUiStore {
  signInOpen: boolean;
  /** One short sentence shown under the logo, e.g. "Sign in to open this control panel." */
  reason: string | null;
  /**
   * Which half of the dialog the caller asked for. A gate whose answer is "make a free account"
   * (the AI door for a student who has none) opens on 'signup', so the account it just described
   * is one form away rather than one toggle plus one form. 'resume' is the token-refresh case: the
   * person already has an account, so the dialog answers with the reason and the no-wall line
   * only, never the free-account sentence written for someone who has never signed in - only while
   * the reader stays on the signin/reset side; toggling to signup inside the dialog restores the
   * sentence, since that reader is creating a second account and needs the same answer everyone
   * else gets. **'resume' only makes sense paired with a reason**: SignInDialog falls back to
   * ACCOUNT_IS_FOR as the headline when `reason` is null, which would read as the free-account
   * pitch sitting directly above a line that says the account is not needed. The one caller today
   * (App.tsx's session-expiry handler) always supplies one; a future 'resume' caller must too.
   * Everything else keeps 'signin'.
   */
  intent: 'signin' | 'signup' | 'resume';
  openSignIn: (reason?: string, intent?: 'signin' | 'signup' | 'resume') => void;
  closeSignIn: () => void;
}

export const useAuthUi = create<AuthUiStore>((set) => ({
  signInOpen: false,
  reason: null,
  intent: 'signin',
  openSignIn: (reason, intent) =>
    set({ signInOpen: true, reason: reason ?? null, intent: intent ?? 'signin' }),
  closeSignIn: () => set({ signInOpen: false, reason: null, intent: 'signin' }),
}));

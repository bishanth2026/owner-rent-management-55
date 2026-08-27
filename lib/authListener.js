import { supabase } from './supabaseClient.js';
import { restoreSession, clearSession } from './sessionManager.js';
import { getApplicationBaseUrl } from './ownerAuth.js';

export function initAuthListener({ onSignedIn, onSignedOut }) {
  supabase.auth.onAuthStateChange((event, authSession) => {

    // Run follow-up Supabase operations outside the auth callback.
    setTimeout(async () => {
      try {
        switch (event) {

          case 'INITIAL_SESSION':
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED': {

            if (authSession) {
              const restored = await restoreSession();

              if (restored) {
                await onSignedIn(restored);
              } else {
                await supabase.auth.signOut();
                onSignedOut();
              }

            } else {
              onSignedOut();
            }

            break;
          }

          // A recovery (or invite) link that doesn't carry an explicit
          // redirectTo override lands here on the main app instead of on
          // reset-password.html. The Supabase session persisted in
          // localStorage (persistSession/storageKey in supabaseClient.js)
          // survives a plain navigation, so send the user to the real
          // Set New Password screen instead of leaving them stuck on the
          // boot-loading state.
          case 'PASSWORD_RECOVERY': {
            if (!window.location.pathname.endsWith('reset-password.html')) {
              window.location.replace(getApplicationBaseUrl());
            }
            break;
          }

          case 'SIGNED_OUT':
            clearSession();
            onSignedOut();
            break;

          default:
            break;
        }

      } catch (err) {
        console.error('BIZNEXCO auth state error:', err);

        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.error(
            'BIZNEXCO sign-out cleanup error:',
            signOutErr
          );
        }

        onSignedOut();
      }
    }, 0);
  });
}

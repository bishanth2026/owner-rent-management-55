import { supabase } from './supabaseClient.js';

// ============================================================
// OWNER SIGN IN
// ============================================================

export async function ownerSignIn(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');

  if (!cleanEmail) {
    throw new Error('Please enter your email address.');
  }

  if (!cleanPassword) {
    throw new Error('Please enter your password.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: cleanPassword,
  });

  if (error) {
    throw new Error(
      error.message || 'Invalid email or password.'
    );
  }

  if (!data?.user) {
    throw new Error('Unable to sign in. Please try again.');
  }

  // Check owner profile
  const profile = await fetchOwnProfile();

  if (!profile) {
    await supabase.auth.signOut();
    throw new Error(
      'Owner profile was not found. Please contact the administrator.'
    );
  }

  if (profile.role !== 'owner') {
    await supabase.auth.signOut();
    throw new Error(
      'This account is not registered as an Owner.'
    );
  }

  return {
    user: data.user,
    profile,
  };
}


// ============================================================
// OWNER SIGN UP
// ============================================================

export async function ownerSignUp() {
  throw new Error(
    'Owner self-registration is disabled. Owner accounts must be provisioned by a platform administrator.'
  );
}


// ============================================================
// OWNER SIGN OUT
// ============================================================

export async function ownerSignOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(
      error.message || 'Unable to sign out.'
    );
  }

  return true;
}


// ============================================================
// GET DEPLOYED APPLICATION URL
// ============================================================

export function getApplicationBaseUrl() {
  /*
   * This application is deployed on GitHub Pages:
   *
   * https://bishanth2026.github.io/Biznexco-Rent-Management-New/
   *
   * The password reset page is:
   *
   * /reset-password.html
   *
   * We deliberately DO NOT use localhost:3000.
   */

  // When running on the deployed GitHub Pages site
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.hostname.endsWith('github.io')
  ) {
    return new URL(
      'reset-password.html',
      window.location.href
    ).href;
  }

  /*
   * When running locally, use the current application origin.
   *
   * Example:
   * http://localhost:3000/reset-password.html
   *
   * This is useful for local development only.
   */

  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.origin
  ) {
    return new URL(
      '/reset-password.html',
      window.location.origin
    ).href;
  }

  /*
   * Final fallback.
   *
   * This should normally never be required.
   */

  return new URL(
    '../reset-password.html',
    import.meta.url
  ).href;
}


// ============================================================
// OWNER PASSWORD RESET REQUEST
// ============================================================

export async function ownerRequestPasswordReset(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!cleanEmail) {
    throw new Error('Please enter your email address.');
  }

  // Validate basic email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  const resetUrl = getApplicationBaseUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(
    cleanEmail,
    {
      redirectTo: resetUrl,
    }
  );

  if (error) {
    /*
     * Supabase may return a rate-limit error when too many
     * reset emails have been requested in a short period.
     */
    const message = String(error.message || '').toLowerCase();

    if (
      message.includes('rate limit') ||
      message.includes('email rate limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    ) {
      throw new Error(
        'Password reset email limit reached. Please wait before requesting another reset email.'
      );
    }

    throw new Error(
      error.message || 'Unable to send password reset email.'
    );
  }

  return true;
}


// ============================================================
// COMPLETE PASSWORD RESET
// ============================================================

export async function ownerCompletePasswordReset(newPassword) {
  const password = String(newPassword || '');

  if (!password) {
    throw new Error('Please enter a new password.');
  }

  if (password.length < 6) {
    throw new Error(
      'Password must contain at least 6 characters.'
    );
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    throw new Error(
      error.message || 'Unable to update password.'
    );
  }

  return true;
}


// ============================================================
// FETCH CURRENT USER PROFILE
// ============================================================

export async function fetchOwnProfile() {
  const {
    data: userResponse,
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError ||
    !userResponse?.user
  ) {
    return null;
  }

  const userId = userResponse.user.id;

  const {
    data,
    error,
  } = await supabase
    .from('profiles')
    .select(
      'id, role, full_name, email'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}


// ============================================================
// GET CURRENT OWNER
// ============================================================

export async function getCurrentOwner() {
  const {
    data: userResponse,
    error,
  } = await supabase.auth.getUser();

  if (
    error ||
    !userResponse?.user
  ) {
    return null;
  }

  const profile = await fetchOwnProfile();

  if (
    !profile ||
    profile.role !== 'owner'
  ) {
    return null;
  }

  return {
    user: userResponse.user,
    profile,
  };
}


// ============================================================
// CHECK OWNER SESSION
// ============================================================

export async function isOwnerAuthenticated() {
  const owner = await getCurrentOwner();

  return !!owner;
}


// ============================================================
// GET OWNER USER
// ============================================================

export async function getOwnerUser() {
  const {
    data,
    error,
  } = await supabase.auth.getUser();

  if (
    error ||
    !data?.user
  ) {
    return null;
  }

  return data.user;
}

// Supabase OAuth-only login (Google)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://cpkuxbounjvdaptzurmq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3V4Ym91bmp2ZGFwdHp1cm1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAzNjMsImV4cCI6MjA3ODAyNjM2M30.SDH0n2T5-3LATftVndaeS_4PG6kBHVwOYVqXD55hzv8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

async function signInWithGoogle() {
  console.log('[auth] signInWithGoogle clicked');
  // Redirect directly to chat page instead of department selection
  const redirectTo = new URL('chat.html', window.location.href).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true }
  });
  if (error) {
    console.error('[auth] signIn error', error);
    alert('Sign-in error: ' + (error?.message || error));
    return;
  }
  if (data?.url) {
    console.log('[auth] redirecting to', data.url);
    window.location.href = data.url;
  } else {
    console.warn('[auth] no redirect url returned');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('supabase-google-btn')?.addEventListener('click', signInWithGoogle);
  // expose for debugging if needed
  window.signInWithGoogle = signInWithGoogle;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'chat.html';
});

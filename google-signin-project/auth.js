// Lightweight auth helpers to avoid premature redirects on OAuth return
// Usage: await requireSession(supabase, 'index.html') before gating pages

export async function waitForSession(supabase, timeoutMs = 5000) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
  } catch {}

  return await new Promise((resolve) => {
    let settled = false;
    let sub;
    const finish = (sess) => {
      if (settled) return;
      settled = true;
      try { clearTimeout(timer); } catch {}
      try { clearInterval(poller); } catch {}
      try { sub?.subscription?.unsubscribe?.(); } catch {}
      resolve(sess || null);
    };

    // Timeout guard
    const timer = setTimeout(() => finish(null), timeoutMs);

    // 1) Listen for auth events (includes INITIAL_SESSION in v2)
    const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (sess) finish(sess);
    });
    sub = data;

    // 2) Also poll getSession a few times in case event doesn't fire
    const poller = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) finish(session);
      } catch {}
    }, 250);
  });
}

export async function requireSession(supabase, redirectTo = 'index.html', timeoutMs = 5000) {
  const sess = await waitForSession(supabase, timeoutMs);
  if (!sess) {
    try { window.location.replace(redirectTo); } catch {}
    throw new Error('No session');
  }
  return sess;
}

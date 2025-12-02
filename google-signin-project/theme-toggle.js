// Theme toggle: persists preference in localStorage and respects system preference
(function(){
  const KEY = 'aa_theme';
  const BTN_ID = 'theme-toggle';

  function setTheme(mode){
    const html = document.documentElement;
    html.classList.remove('light','dark');
    html.classList.add(mode);
    try{ localStorage.setItem(KEY, mode); }catch{}
    updateButton(mode);
  }

  function updateButton(mode){
    const btn = document.getElementById(BTN_ID);
    if(!btn) return;
    if(mode === 'dark'){
      btn.textContent = '🌙';
      btn.setAttribute('aria-pressed','true');
      btn.setAttribute('aria-label','Switch to light mode');
    } else {
      btn.textContent = '☀️';
      btn.setAttribute('aria-pressed','false');
      btn.setAttribute('aria-label','Switch to dark mode');
    }
  }

  function init(){
    const stored = (function(){ try{ return localStorage.getItem(KEY); }catch{ return null; }})();
    // Default to dark mode for first-time visitors when no stored preference exists.
    const initial = stored || 'dark';
    setTheme(initial);

    // Toggle handler
    document.addEventListener('click', (e)=>{
      const t = e.target;
      if(!t) return;
      if(t.id === BTN_ID || t.closest && t.closest('#'+BTN_ID)){
        const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        setTheme(current === 'dark' ? 'light' : 'dark');
      }
    });

    // Respond to system changes when user hasn't explicitly chosen
    try{
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener?.('change', (e)=>{
        const storedNow = localStorage.getItem(KEY);
        if(!storedNow){ setTheme(e.matches ? 'dark':'light'); }
      });
    }catch{}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

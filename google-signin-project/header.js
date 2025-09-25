// header.js
(function renderHeader() {
  const el = document.getElementById("app-header");
  if (!el) return;

  el.innerHTML = `
    <div class="app-header">
      <a class="brand" href="index.html" aria-label="Accelerated Advising Home">
        <img src="assets/kaizenexus_logo.svg" alt="Kaizenexus logo" class="brand-img" />
        <span class="brand-title">Accelerated Advising</span>
      </a>
      <div class="header-right">
        <span class="user-pill">Demo User (demo@example.com)</span>
        <a class="btn-signout" href="index.html">Sign Out</a>
      </div>
    </div>
  `;
})();

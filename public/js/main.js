// Auto-dismiss alerts
document.querySelectorAll('.alert').forEach(el => {
  setTimeout(() => { el.style.transition='opacity .4s'; el.style.opacity='0'; setTimeout(()=>el.remove(),400); }, 4000);
});
// Navbar scroll shadow
const navbar = document.getElementById('navbar');
if (navbar) window.addEventListener('scroll', () => navbar.classList.toggle('navbar--scrolled', window.scrollY > 20));
// Logout confirm
document.querySelectorAll('form[action="/auth/logout"]').forEach(form => {
  form.addEventListener('submit', e => { if (!confirm('Sign out of HeartLink?')) e.preventDefault(); });
});
// Smooth scroll for hash links
document.querySelectorAll('a[href^="#"],a[href^="/#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    const hash = href.startsWith('/#') ? href.slice(2) : href.slice(1);
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior:'smooth' }); }
  });
});
// Nav unread dot
(function() {
  const dot  = document.getElementById('nav-unread-dot');
  const mdot = document.getElementById('mbn-unread-dot');
  if (!dot && !mdot) return;
  async function check() {
    try {
      const d = await (await fetch('/chats/unread')).json();
      if (dot)  dot.style.display  = d.count > 0 ? 'block' : 'none';
      if (mdot) mdot.style.display = d.count > 0 ? 'block' : 'none';
    } catch(e) {}
  }
  check();
  setInterval(check, 10000);
})();

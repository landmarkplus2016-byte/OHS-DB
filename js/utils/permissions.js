// permissions.js — route access guard. Light: only two roles exist.

// Decides whether `user` may render `route`. `route` is the first hash segment
// (e.g. 'dashboard', 'field', 'check', or a full 'check/home' — startsWith is used
// so either form works). Returns { ok, redirect } where redirect is where to send
// the user when ok is false: 'login' | 'dashboard' | 'check'.
export function canAccessRoute(user, route) {
  const isCheckRoute = String(route).startsWith('check');

  // Not logged in: login page and the officer shell (which renders its own login)
  // are the only public entry points.
  if (!user) {
    if (route === 'login' || isCheckRoute) return { ok: true, redirect: null };
    return { ok: false, redirect: 'login' };
  }

  // Admin: everything except the officer shell.
  if (user.role === 'admin') {
    if (isCheckRoute) return { ok: false, redirect: 'dashboard' };
    return { ok: true, redirect: null };
  }

  // Officer: officer shell only.
  if (user.role === 'officer') {
    if (isCheckRoute) return { ok: true, redirect: null };
    return { ok: false, redirect: 'check' };
  }

  // Unknown role — send to admin login.
  return { ok: false, redirect: 'login' };
}

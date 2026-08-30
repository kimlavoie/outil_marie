/**
 * permissions.ts - Role-based view access, wired in ahead of real Firebase Auth so plugging in
 * actual sign-in later is a one-function swap (getCurrentUserRole's body) instead of threading
 * permission checks through the UI under time pressure. There is no login yet — every real user
 * today gets "full_access", so nothing here changes what anyone currently sees.
 */

export type UserRole = "full_access" | "dashboard_only";

// Views each role may see, by the same view ids used in Sidebar.tsx's NAV_ITEMS / App.tsx's
// currentView. A role with no entry here (like "full_access") is treated as unrestricted — every
// current and future view — rather than requiring every role to enumerate the full view list, so
// adding a new view later can't silently lock existing "full_access" users out of it.
const RESTRICTED_VIEWS: Partial<Record<UserRole, string[]>> = {
  dashboard_only: ["dashboard"]
};

// Debug-only role override for previewing a restricted role without any real login — there's no
// auth to sign in with yet. Deliberately not surfaced anywhere in the UI (no button, no menu):
// open the browser console and run
//   localStorage.setItem("outil_marie_role_override_debug", "dashboard_only")
// then reload. Clear it (or set it back to "full_access") to return to the normal view.
const ROLE_OVERRIDE_KEY = "outil_marie_role_override_debug";

// TODO(firebase-auth): once sign-in exists, replace the body of this function with the signed-in
// user's real role (e.g. a custom claim or a field on their user doc) instead of the debug
// override below.
export function getCurrentUserRole(): UserRole {
  try {
    const override = typeof localStorage !== "undefined" ? localStorage.getItem(ROLE_OVERRIDE_KEY) : null;
    if (override === "dashboard_only" || override === "full_access") return override;
  } catch {
    // localStorage unavailable (e.g. the Node test environment) - fall through to the default.
  }
  return "full_access";
}

export function canAccessView(viewId: string, role: UserRole = getCurrentUserRole()): boolean {
  const restrictedTo = RESTRICTED_VIEWS[role];
  return !restrictedTo || restrictedTo.includes(viewId);
}

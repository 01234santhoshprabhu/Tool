(function () {
    'use strict';

    const firebaseConfig = {
        apiKey: 'AIzaSyButgD2N77doaabtGf-uzffjA5Xc4lh_sU',
        authDomain: 'nptelportalteam.firebaseapp.com',
        projectId: 'nptelportalteam',
        storageBucket: 'nptelportalteam.firebasestorage.app',
        messagingSenderId: '574729426785',
        appId: '1:574729426785:web:12c57aa54179167eeb1720'
    };

    // Empty means any Google account can sign in. Add lowercase emails to restrict access.
    const ALLOWED_EMAILS = [
        // 'santhoshofficial70@gmail.com'
    ];

    const ROLE_SUPABASE_URL = 'https://oiebamupeucekvcfscpj.supabase.co';
    const ROLE_SUPABASE_KEY = 'sb_publishable_w_l-WFz9E-IrPoQwGqodZw_Zsx929gv';

    const $ = id => document.getElementById(id);
    let auth;
    let currentRole = 'viewer';

    async function fetchRole(email) {
        try {
            const response = await fetch(
                `${ROLE_SUPABASE_URL}/rest/v1/dashboard_users?select=role&email=eq.${encodeURIComponent(email.toLowerCase())}`,
                { headers: { apikey: ROLE_SUPABASE_KEY, Authorization: `Bearer ${ROLE_SUPABASE_KEY}` } }
            );
            if (!response.ok) return 'viewer';
            const rows = await response.json();
            const role = rows && rows[0] && rows[0].role;
            return ['viewer', 'admin', 'super_admin'].includes(role) ? role : 'viewer';
        } catch (err) {
            return 'viewer';
        }
    }

    function applyRoleBadge(role) {
        const badge = $('auth-user-role');
        if (!badge) return;
        const labels = { super_admin: 'Super Admin', admin: 'Admin', viewer: 'Viewer' };
        badge.textContent = labels[role] || 'Viewer';
        badge.classList.remove('role-super_admin', 'role-admin', 'role-viewer');
        badge.classList.add(`role-${role}`);
    }

    function setMessage(text) {
        const el = $('auth-message');
        if (el) el.textContent = text;
    }

    function setError(text) {
        const el = $('auth-error');
        if (el) el.textContent = text || '';
    }

    function setBusy(isBusy) {
        const btn = $('auth-google-btn');
        if (btn) btn.disabled = !!isBusy;
    }

    function isAllowed(user) {
        if (!user || !user.email) return false;
        if (!ALLOWED_EMAILS.length) return true;
        return ALLOWED_EMAILS.includes(user.email.toLowerCase());
    }

    function showLocked(message) {
        document.body.classList.remove('auth-ready');
        document.body.classList.add('auth-locked');
        setMessage(message || 'Sign in with your Google account to continue.');
        const retry = $('auth-retry-btn');
        if (retry) retry.style.display = 'none';
        const pill = $('auth-user-pill');
        if (pill) pill.style.display = 'none';
    }

    async function showReady(user) {
        document.body.classList.remove('auth-pending', 'auth-locked');
        document.body.classList.add('auth-ready');
        setError('');
        const email = $('auth-user-email');
        if (email) email.textContent = user.email || user.displayName || 'Signed in';
        const pill = $('auth-user-pill');
        if (pill) pill.style.display = 'inline-flex';
        currentRole = user.email ? await fetchRole(user.email) : 'viewer';
        document.body.classList.remove('role-viewer', 'role-admin', 'role-super_admin');
        document.body.classList.add(`role-${currentRole}`);
        applyRoleBadge(currentRole);
        window.dispatchEvent(new CustomEvent('tool-auth-ready', { detail: { user, role: currentRole } }));
    }

    function googleProvider() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
    }

    async function signIn() {
        if (!auth) {
            setError('Firebase Authentication is still loading. Please try again.');
            return;
        }
        setBusy(true);
        setError('');
        setMessage('Opening Google sign-in...');
        const unlockTimer = window.setTimeout(() => {
            setBusy(false);
            setMessage('Sign in with your Google account to continue.');
        }, 6000);
        try {
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            await auth.signInWithRedirect(googleProvider());
        } catch (err) {
            window.clearTimeout(unlockTimer);
            setBusy(false);
            setMessage('Sign in with your Google account to continue.');
            setError((err && err.message) ? err.message : 'Google sign-in failed. Please try again.');
        }
    }
    async function signOut() {
        if (!auth) return;
        await auth.signOut();
    }

    function initAuth() {
        const signInBtn = $('auth-google-btn');
        const retryBtn = $('auth-retry-btn');
        const signOutBtn = $('auth-signout-btn');
        if (signInBtn) signInBtn.addEventListener('click', signIn);
        if (retryBtn) retryBtn.addEventListener('click', signIn);
        if (signOutBtn) signOutBtn.addEventListener('click', signOut);

        if (!window.firebase || !firebase.initializeApp || !firebase.auth) {
            showLocked('Firebase Authentication did not load. Check your internet connection and refresh.');
            setError('Unable to load Firebase Auth SDK.');
            return;
        }

        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();

        auth.getRedirectResult().catch(err => setError(err.message || 'Google sign-in redirect failed.'));
        auth.onAuthStateChanged(user => {
            setBusy(false);
            if (!user) {
                showLocked('Sign in with your Google account to continue.');
                return;
            }
            if (!isAllowed(user)) {
                showLocked('This Google account is not approved for this tool.');
                setError(user.email + ' is not in the allowed list.');
                auth.signOut();
                return;
            }
            showReady(user);
        }, err => {
            showLocked('Authentication check failed. Please refresh and try again.');
            setError(err.message || 'Authentication failed.');
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAuth);
    else initAuth();
})();

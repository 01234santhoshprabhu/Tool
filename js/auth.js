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

    const $ = id => document.getElementById(id);
    let auth;

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

    function showReady(user) {
        document.body.classList.remove('auth-pending', 'auth-locked');
        document.body.classList.add('auth-ready');
        setError('');
        const email = $('auth-user-email');
        if (email) email.textContent = user.email || user.displayName || 'Signed in';
        const pill = $('auth-user-pill');
        if (pill) pill.style.display = 'inline-flex';
    }

    async function signIn() {
        if (!auth) return;
        setBusy(true);
        setError('');
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await auth.signInWithPopup(provider);
        } catch (err) {
            if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request')) {
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await auth.signInWithRedirect(provider);
                return;
            }
            setError((err && err.message) ? err.message : 'Google sign-in failed. Please try again.');
        } finally {
            setBusy(false);
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

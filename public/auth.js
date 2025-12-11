// Supabase Auth Helper
const SUPABASE_URL = 'https://zumvtcckjvengyhtqlaf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1bXZ0Y2NranZlbmd5aHRxbGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjE3ODUsImV4cCI6MjA4MDA5Nzc4NX0.tYn5Pl92THzT47aBzY8mWL3TT-gC0PGdId9ZWdYBJ7Q';

// Supabase client (using REST API directly for simplicity)
const Auth = {
  // Get current session from localStorage
  getSession() {
    const stored = localStorage.getItem('supabase-auth');
    if (!stored) return null;

    try {
      const data = JSON.parse(stored);
      // Check if access token is expired
      if (data.expires_at && Date.now() / 1000 > data.expires_at) {
        // Token expired, try to refresh
        return this.refreshSession(data.refresh_token);
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  // Save session to localStorage
  saveSession(session) {
    localStorage.setItem('supabase-auth', JSON.stringify(session));
  },

  // Clear session
  clearSession() {
    localStorage.removeItem('supabase-auth');
  },

  // Refresh session using refresh token
  async refreshSession(refreshToken) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!res.ok) {
        this.clearSession();
        return null;
      }

      const data = await res.json();
      const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        user: data.user
      };
      this.saveSession(session);
      return session;
    } catch (e) {
      this.clearSession();
      return null;
    }
  },

  // Sign in with Magic Link
  async signInWithMagicLink(email) {
    const redirectUrl = window.location.origin + '/auth-callback.html';
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        email: email,
        create_user: true,
        data: {},
        gotrue_meta_security: {},
        code_challenge: null,
        code_challenge_method: null
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to send magic link');
    }

    return { success: true };
  },

  // Sign in with email/password
  async signInWithPassword(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await res.json();
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: data.user
    };
    this.saveSession(session);
    return session;
  },

  // Sign out
  async signOut() {
    const session = this.getSession();
    if (session?.access_token) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY
          }
        });
      } catch (e) {
        // Ignore errors
      }
    }
    this.clearSession();
  },

  // Check if user is logged in
  isLoggedIn() {
    return !!this.getSession();
  },

  // Get current user
  getUser() {
    const session = this.getSession();
    return session?.user || null;
  },

  // Handle OAuth callback (for magic link)
  async handleCallback() {
    const hash = window.location.hash;
    if (!hash) return null;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresAt = params.get('expires_at');

    if (accessToken && refreshToken) {
      // Get user info
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY
        }
      });

      if (res.ok) {
        const user = await res.json();
        const session = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: parseInt(expiresAt),
          user: user
        };
        this.saveSession(session);
        return session;
      }
    }
    return null;
  },

  // Require auth - redirect to login if not authenticated
  requireAuth(loginUrl = '/login.html') {
    if (!this.isLoggedIn()) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${loginUrl}?return=${returnUrl}`;
      return false;
    }
    return true;
  },

  // Get doctor_id from email (part before @)
  getDoctorId() {
    const user = this.getUser();
    if (!user?.email) return null;
    return user.email.split('@')[0];
  },

  // Get user email
  getEmail() {
    const user = this.getUser();
    return user?.email || null;
  }
};

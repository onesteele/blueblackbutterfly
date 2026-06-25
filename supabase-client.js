// Supabase Client Configuration
// Replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://vnhrwcerlaoipycsbigi.supabase.co'; // e.g., https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuaHJ3Y2VybGFvaXB5Y3NiaWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNTA3NTksImV4cCI6MjA4NDkyNjc1OX0.LOlRKqiOzsCBX2R6qcYukt3IG5onX3e4O-RIjcWWMnU'; // From your Supabase project settings

// Initialize Supabase client and make it globally available
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        flowType: 'implicit',
        detectSessionInUrl: true
    }
});

// Helper function to get current user
window.getCurrentUser = async function() {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    if (error) {
        console.error('Error getting session:', error);
        return null;
    }
    return session?.user || null;
};

// Helper function to get user profile from database
window.getUserProfile = async function(userId) {
    const { data, error } = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
    return data;
};

// Helper function to check if user is admin (uses role-based check)
window.isAdmin = async function() {
    const user = await window.getCurrentUser();
    if (!user) return false;

    const profile = await window.getUserProfile(user.id);
    return window.hasAdminAccess(profile);
};

// Helper function to update last login
window.updateLastLogin = async function(userId) {
    const { error } = await window.supabaseClient
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId);

    if (error) {
        console.error('Error updating last login:', error);
    }
};

// Helper function to get user IP address and location
window.getUserIP = async function() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const ip = data.ip || 'Unknown';
        window._geoData = { ip: ip, city: '', region: '', country: '' };
        // Fetch geo data — try primary API, then fallback
        try {
            const geoResponse = await fetch('https://ipapi.co/' + ip + '/json/');
            if (geoResponse.ok) {
                const geo = await geoResponse.json();
                window._geoData.city = geo.city || '';
                window._geoData.region = geo.region || '';
                window._geoData.country = geo.country_name || '';
            } else {
                throw new Error('Primary geo API failed');
            }
        } catch (geoErr1) {
            console.warn('Primary geo lookup failed, trying fallback...');
            try {
                const geoResponse2 = await fetch('https://free.freeipapi.com/api/json/' + ip);
                if (geoResponse2.ok) {
                    const geo2 = await geoResponse2.json();
                    window._geoData.city = geo2.cityName || '';
                    window._geoData.region = geo2.regionName || '';
                    window._geoData.country = geo2.countryName || '';
                }
            } catch (geoErr2) {
                console.warn('Fallback geo lookup also failed, continuing with IP only');
            }
        }
        return ip;
    } catch (error) {
        console.error('Error getting IP:', error);
        window._geoData = { ip: 'Unknown', city: '', region: '', country: '' };
        return 'Unknown';
    }
};

// Sign out helper
window.signOut = async function() {
    try {
        // Check if there's an active session first
        const { data: { session } } = await window.supabaseClient.auth.getSession();

        // Only attempt sign out if there's an active session
        if (session) {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) {
                console.error('Error signing out:', error);
            }
        }

        // Redirect to auth page regardless
        window.location.href = '/auth';
    } catch (error) {
        console.error('Sign out error:', error);
        // Even if there's an error, redirect to auth page
        window.location.href = '/auth';
    }
};

// ============================================================
// ROLE-BASED PERMISSION HELPERS
// ============================================================
// Roles: owner, super_admin, admin, sales_team, user

window.getUserRole = function(profile) {
    return profile?.role || 'user';
};

// Cached role permissions (loaded from admin_settings)
window._rolePermissions = null;

// Load role permissions from admin_settings and cache them
window.loadRolePermissions = async function() {
    if (window._rolePermissions) return window._rolePermissions;
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'role_permissions')
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        window._rolePermissions = (data && data.value) ? data.value : null;
    } catch (err) {
        console.warn('Could not load role permissions, using defaults:', err);
        window._rolePermissions = null;
    }
    return window._rolePermissions;
};

// Check a specific permission for a profile
window.checkPermission = function(profile, permissionKey) {
    var role = window.getUserRole(profile);
    // owner and super_admin always have all permissions
    if (role === 'owner' || role === 'super_admin') return true;
    // Non-admin roles never have these permissions
    if (role !== 'admin' && role !== 'sales_team') return false;
    // Check cached permissions
    if (window._rolePermissions && window._rolePermissions[role]) {
        return window._rolePermissions[role][permissionKey] === true;
    }
    // Fallback defaults if permissions haven't loaded
    var defaults = {
        admin: { create_users: true, delete_users: false, change_status: true, view_metrics: true, manage_content: true, manage_announcements: true, manage_workflows: true, manage_notifications: true, view_conversations: true, view_settings: false },
        sales_team: { create_users: true, delete_users: false, change_status: false, view_metrics: false, manage_content: false, manage_announcements: false, manage_workflows: false, manage_notifications: false, view_conversations: true, view_settings: false }
    };
    if (defaults[role]) return defaults[role][permissionKey] === true;
    return false;
};

// Can access admin panel at all (unchanged — RLS gatekeeper)
window.hasAdminAccess = function(profile) {
    return ['owner', 'super_admin', 'admin', 'sales_team'].includes(profile?.role);
};

// Can delete customers
window.canDeleteCustomers = function(profile) {
    return window.checkPermission(profile, 'delete_users');
};

// Can manage content posts
window.canManageContent = function(profile) {
    return window.checkPermission(profile, 'manage_content');
};

// Can access settings page
window.canManageSettings = function(profile) {
    var role = window.getUserRole(profile);
    if (role === 'owner' || role === 'super_admin') return true;
    return window.checkPermission(profile, 'view_settings');
};

// Can manage team members (assign roles) — always owner/super_admin only
window.canManageTeam = function(profile) {
    return ['owner', 'super_admin'].includes(profile?.role);
};

// Can create new users from admin panel
window.canCreateUsers = function(profile) {
    return window.checkPermission(profile, 'create_users');
};

// Can change customer status
window.canChangeStatus = function(profile) {
    return window.checkPermission(profile, 'change_status');
};

// SVG icons for sidebar
window._sidebarIcons = {
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg>',
    customers: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>',
    conversations: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>',
    content: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
    announcements: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>',
    workflows: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>',
    notifications: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>'
};

// Apply role-based sidebar filtering - call after auth check and loadRolePermissions()
window.applySidebarRole = function(profile, activePage) {
    var navEl = document.querySelector('.sidebar-nav');
    if (!navEl) return;

    var items = [
        { href: '/admin/', icon: 'dashboard', label: 'Dashboard', id: 'dashboard', visible: true },
        { href: '/admin/customers.html', icon: 'customers', label: 'Customers', id: 'customers', visible: true },
        { href: '/admin/conversations.html', icon: 'conversations', label: 'Conversations', id: 'conversations', visible: window.checkPermission(profile, 'view_conversations') },
        { href: '/admin/content.html', icon: 'content', label: 'Content', id: 'content', visible: window.checkPermission(profile, 'manage_content') },
        { href: '/admin/announcements.html', icon: 'announcements', label: 'Announcements', id: 'announcements', visible: window.checkPermission(profile, 'manage_announcements') },
        { href: '/admin/workflows.html', icon: 'workflows', label: 'Workflows', id: 'workflows', visible: window.checkPermission(profile, 'manage_workflows') },
        { href: '/admin/notifications.html', icon: 'notifications', label: 'Notifications', id: 'notifications', visible: window.checkPermission(profile, 'manage_notifications') },
        { href: '/admin/settings.html', icon: 'settings', label: 'Settings', id: 'settings', visible: window.canManageSettings(profile) },
    ];

    var html = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.visible) continue;
        var activeClass = activePage === item.id ? ' active' : '';
        html += '<a href="' + item.href + '" class="nav-item' + activeClass + '">' +
            '<span class="nav-icon">' + window._sidebarIcons[item.icon] + '</span>' +
            '<span class="nav-label">' + item.label + '</span>' +
        '</a>\n';
    }

    // Add theme toggle at bottom of nav
    html += '<div style="margin-top:auto;padding:12px 0;display:flex;justify-content:center;">' +
        '<button class="theme-toggle-btn" onclick="window.toggleTheme()"></button>' +
        '</div>';

    navEl.innerHTML = html;

    // Prefetch admin pages for instant navigation
    for (var j = 0; j < items.length; j++) {
        if (items[j].visible && activePage !== items[j].id) {
            var link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = items[j].href;
            document.head.appendChild(link);
        }
    }
};

// ============================================================
// CLIENT PORTAL SIDEBAR
// ============================================================

window._clientSidebarIcons = {
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline stroke-linecap="round" stroke-linejoin="round" points="9 22 9 12 15 12 15 22"/></svg>',
    content: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    announcements: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>',
    messages: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',
    performance: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>',
    account: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
};

window.applyClientSidebar = function(activePage, userStatus) {
    const navEl = document.querySelector('.client-sidebar-nav');
    if (!navEl) return;

    const isFreeTrialUser = userStatus === 'free_trial' || userStatus === 'free_trial_expired';

    const allItems = [
        { href: '/', icon: 'dashboard', label: 'Dashboard', id: 'dashboard', freeTrial: true },
        { href: '/portal/performance.html', icon: 'performance', label: 'Performance', id: 'performance', freeTrial: false },
        { href: '/portal/content.html', icon: 'content', label: 'Content', id: 'content', freeTrial: true },
        { href: '/portal/announcements.html', icon: 'announcements', label: 'Announcements', id: 'announcements', freeTrial: true },
        { href: '/portal/chat.html', icon: 'messages', label: 'Support', id: 'messages', freeTrial: false },
        { href: '/portal/account.html', icon: 'account', label: 'Account', id: 'account', freeTrial: false },
    ];

    const items = isFreeTrialUser ? allItems.filter(item => item.freeTrial) : allItems;

    let html = '';
    for (const item of items) {
        const activeClass = activePage === item.id ? ' active' : '';
        html += `<a href="${item.href}" class="cs-nav-item${activeClass}">
            <span class="cs-nav-icon">${window._clientSidebarIcons[item.icon]}</span>
            <span class="cs-nav-label">${item.label}</span>
        </a>\n`;
    }

    navEl.innerHTML = html;

    // Prefetch client pages for instant navigation
    items.forEach(item => {
        if (activePage !== item.id) {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = item.href;
            document.head.appendChild(link);
        }
    });

    // Intercept sidebar nav clicks for smooth page transitions
    navEl.querySelectorAll('.cs-nav-item').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            window._navigateWithTransition(link.getAttribute('href'));
        });
    });
};

// Navigate with fade-out transition
window._navigateWithTransition = function(url) {
    if (!url || url.startsWith('#') || url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('javascript:')) {
        window.location.href = url;
        return;
    }
    document.body.classList.add('page-fade-out');
    setTimeout(function() {
        window.location.href = url;
    }, 200);
};

// ============================================================
// THEME SYSTEM (dark + light mode with toggle)
// ============================================================
(function() {
    // Inject theme CSS overrides once
    var style = document.createElement('style');
    style.id = 'pi-theme-overrides';
    style.textContent = `
        /* Dark mode: make all secondary/muted text white for better readability */
        [data-theme="dark"] {
            --text-secondary: #ffffff;
            --text-muted: #ffffff;
        }

        /* Light mode overrides */
        [data-theme="light"] {
            --bg-dark: #f5f5f7;
            --bg-card: #ffffff;
            --text-primary: #111111;
            --text-secondary: #333333;
            --text-muted: #555555;
            --border: #e0e0e0;
            --accent: #d4a017;
            --accent-light: #2a4fd6;
            --accent-dim: rgba(212, 160, 23, 0.1);
            --accent-glow: rgba(212, 160, 23, 0.2);
            --success: #16a34a;
            --error: #dc2626;
        }

        /* ---- Light mode: global resets ---- */
        [data-theme="light"] body {
            background: #f5f5f7 !important;
            color: #111111;
        }

        [data-theme="light"] .bg-animation,
        [data-theme="light"] .dot-pattern,
        [data-theme="light"] .orb,
        [data-theme="light"] .orb-1,
        [data-theme="light"] .orb-2,
        [data-theme="light"] .orb-3 {
            display: none !important;
        }

        /* ---- Sidebar ---- */
        [data-theme="light"] .sidebar {
            background: #ffffff !important;
            border-right: 1px solid #e0e0e0;
        }
        [data-theme="light"] .sidebar .nav-item { color: #333; }
        [data-theme="light"] .sidebar .nav-item:hover,
        [data-theme="light"] .sidebar .nav-item.active {
            background: rgba(212, 160, 23, 0.1);
            color: #111;
        }
        [data-theme="light"] .sidebar .nav-item .nav-icon { color: #555; }
        [data-theme="light"] .sidebar .nav-item.active .nav-icon { color: var(--accent); }

        /* Client sidebar */
        [data-theme="light"] #client-sidebar,
        [data-theme="light"] .client-sidebar {
            background: #ffffff !important;
            border-right: 1px solid #e0e0e0;
        }
        [data-theme="light"] .cs-nav-item { color: #333 !important; }
        [data-theme="light"] .cs-nav-item:hover,
        [data-theme="light"] .cs-nav-item.active { background: rgba(212, 160, 23, 0.1) !important; color: #111 !important; }
        [data-theme="light"] .cs-signout { color: #555 !important; }
        [data-theme="light"] .cs-signout:hover { color: var(--error) !important; }

        /* ---- Top bar ---- */
        [data-theme="light"] .top-bar {
            background: rgba(255, 255, 255, 0.95) !important;
            border-bottom: 1px solid #e0e0e0;
        }
        [data-theme="light"] .hamburger-btn {
            background: #ffffff !important;
            color: #333 !important;
            border: 1px solid #e0e0e0;
        }

        /* ---- Cards and containers ---- */
        [data-theme="light"] .settings-card,
        [data-theme="light"] .content-card,
        [data-theme="light"] .stat-card,
        [data-theme="light"] .table-card,
        [data-theme="light"] .booking-card,
        [data-theme="light"] .v-card {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .card-header {
            background: #fafafa !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .card-body { background: #ffffff !important; }

        /* ---- Dashboard body ---- */
        [data-theme="light"] .dashboard-body,
        [data-theme="light"] .page-body {
            background: transparent;
        }

        /* ---- Forms ---- */
        [data-theme="light"] .form-input,
        [data-theme="light"] .form-textarea,
        [data-theme="light"] textarea.form-input,
        [data-theme="light"] select.form-input,
        [data-theme="light"] input.form-input {
            background: #ffffff !important;
            color: #111 !important;
            border-color: #d0d0d0 !important;
        }
        [data-theme="light"] .form-input:focus,
        [data-theme="light"] .form-textarea:focus {
            border-color: var(--accent) !important;
            box-shadow: 0 0 0 3px rgba(212, 160, 23, 0.1) !important;
        }
        [data-theme="light"] .form-input::placeholder,
        [data-theme="light"] textarea::placeholder,
        [data-theme="light"] input::placeholder {
            color: #999 !important;
        }
        [data-theme="light"] .form-label,
        [data-theme="light"] label {
            color: #333 !important;
        }

        /* ---- Buttons ---- */
        [data-theme="light"] .btn-secondary,
        [data-theme="light"] .btn.btn-secondary {
            background: #f0f0f2 !important;
            color: #333 !important;
            border-color: #d0d0d0 !important;
        }
        [data-theme="light"] .btn-secondary:hover { background: #e5e5e7 !important; }

        /* ---- Modals ---- */
        [data-theme="light"] .modal-overlay { background: rgba(0, 0, 0, 0.4) !important; }
        [data-theme="light"] .modal-card,
        [data-theme="light"] .modal-content,
        [data-theme="light"] .ticket-modal,
        [data-theme="light"] .q-modal,
        [data-theme="light"] .confirm-dialog {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
            color: #111 !important;
        }
        [data-theme="light"] .modal-header {
            background: #fafafa !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .modal-body { background: #ffffff !important; }

        /* ---- Chat ---- */
        [data-theme="light"] .chat-header,
        [data-theme="light"] .chat-input-area {
            background: rgba(255, 255, 255, 0.95) !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .chat-input,
        [data-theme="light"] .chat-input-wrapper,
        [data-theme="light"] #chat-input {
            background: #f5f5f7 !important;
            color: #111 !important;
            border-color: #d0d0d0 !important;
        }
        [data-theme="light"] .msg-row.me .msg-bubble,
        [data-theme="light"] .msg-row.admin .msg-bubble {
            background: var(--accent) !important;
            color: #000 !important;
        }
        [data-theme="light"] .msg-row.them .msg-bubble,
        [data-theme="light"] .msg-row.customer .msg-bubble {
            background: #f0f0f2 !important;
            color: #111 !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .msg-meta { color: #888 !important; }
        [data-theme="light"] .msg-sender { color: #555 !important; }
        [data-theme="light"] .resolved-banner {
            background: rgba(0, 0, 0, 0.04) !important;
            border-color: #e0e0e0 !important;
        }

        /* ---- Conversations panel (admin) ---- */
        [data-theme="light"] .conv-list-panel,
        [data-theme="light"] .conv-chat-panel,
        [data-theme="light"] .context-panel {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .conv-item { border-color: #eee !important; }
        [data-theme="light"] .conv-item:hover { background: #f5f5f7 !important; }
        [data-theme="light"] .conv-item.active { background: rgba(212, 160, 23, 0.08) !important; border-color: var(--accent) !important; }
        [data-theme="light"] .conv-filter-tab { color: #555 !important; }
        [data-theme="light"] .conv-filter-tab.active { background: var(--accent) !important; color: #000 !important; }
        [data-theme="light"] .conv-search {
            background: #f5f5f7 !important;
            color: #111 !important;
            border-color: #d0d0d0 !important;
        }
        [data-theme="light"] .conv-empty-state,
        [data-theme="light"] .conv-list-empty { color: #888 !important; }
        [data-theme="light"] .identity-switcher {
            background: #f5f5f7 !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .identity-select {
            background: #ffffff !important;
            color: #111 !important;
            border-color: #d0d0d0 !important;
        }

        /* ---- Support hub (portal) ---- */
        [data-theme="light"] .support-hub,
        [data-theme="light"] .support-wrapper {
            background: transparent !important;
        }
        [data-theme="light"] .support-hero h1 {
            background: none !important;
            -webkit-text-fill-color: #111 !important;
            color: #111 !important;
        }
        [data-theme="light"] .conv-card {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .conv-card:hover { background: #f9f9f9 !important; }

        /* ---- Tables ---- */
        [data-theme="light"] table { color: #111; }
        [data-theme="light"] th { background: #fafafa !important; color: #333 !important; border-color: #e0e0e0 !important; }
        [data-theme="light"] td { border-color: #eee !important; }
        [data-theme="light"] tr:hover td { background: #f9f9f9 !important; }

        /* ---- Tabs ---- */
        [data-theme="light"] .settings-tabs,
        [data-theme="light"] .conv-filter-tabs {
            background: #f5f5f7 !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .settings-tab { color: #555 !important; }
        [data-theme="light"] .settings-tab:hover { background: #eee !important; color: #111 !important; }
        [data-theme="light"] .settings-tab.active {
            background: var(--accent) !important;
            color: #000 !important;
        }
        [data-theme="light"] .tab-content { color: #111; }

        /* ---- Toast ---- */
        [data-theme="light"] .toast.success { background: rgba(22, 163, 74, 0.1) !important; border-color: rgba(22, 163, 74, 0.3) !important; }
        [data-theme="light"] .toast.error { background: rgba(220, 38, 38, 0.1) !important; border-color: rgba(220, 38, 38, 0.3) !important; }

        /* ---- Dropdowns, selects, context menus ---- */
        [data-theme="light"] select,
        [data-theme="light"] option {
            background: #ffffff !important;
            color: #111 !important;
        }

        /* ---- Misc: all rgba(255,255,255,low-alpha) backgrounds become visible gray ---- */
        [data-theme="light"] [style*="rgba(255,255,255,0.0"],
        [data-theme="light"] [style*="rgba(255, 255, 255, 0.0"] {
            background-color: #f5f5f7 !important;
        }

        /* ---- Onboarding / Auth ---- */
        [data-theme="light"] .auth-card,
        [data-theme="light"] .login-card,
        [data-theme="light"] .signup-card,
        [data-theme="light"] .recovery-card {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .lesson-container,
        [data-theme="light"] .course-header {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
        }

        /* ---- Admin badges ---- */
        [data-theme="light"] .admin-badge {
            background: rgba(212, 160, 23, 0.1) !important;
            color: var(--accent) !important;
        }
        [data-theme="light"] .status-badge { color: #333 !important; }

        /* ---- Scrollbars ---- */
        [data-theme="light"] ::-webkit-scrollbar-thumb { background: #ccc !important; }
        [data-theme="light"] ::-webkit-scrollbar-track { background: #f0f0f0 !important; }

        /* ---- Category options in ticket modal ---- */
        [data-theme="light"] .category-option {
            background: #f9f9f9 !important;
            border-color: #e0e0e0 !important;
        }
        [data-theme="light"] .category-option:hover { background: #f0f0f2 !important; }
        [data-theme="light"] .category-option.selected {
            background: rgba(212, 160, 23, 0.08) !important;
            border-color: var(--accent) !important;
        }

        /* ---- Confirm dialogs ---- */
        [data-theme="light"] .confirm-overlay { background: rgba(0, 0, 0, 0.3) !important; }

        /* ---- Portal page titles with gradient text ---- */
        [data-theme="light"] h1[style*="background-clip"],
        [data-theme="light"] .page-title {
            -webkit-text-fill-color: #111 !important;
            color: #111 !important;
            background: none !important;
        }

        /* ---- Context panel (admin right sidebar) ---- */
        [data-theme="light"] .ctx-section { border-color: #eee !important; }
        [data-theme="light"] .ctx-notes-area,
        [data-theme="light"] .ctx-notes {
            background: #f5f5f7 !important;
            color: #111 !important;
            border-color: #d0d0d0 !important;
        }
        [data-theme="light"] .tag-pill { background: #f0f0f2 !important; color: #333 !important; }
        [data-theme="light"] .tag-dropdown {
            background: #ffffff !important;
            border-color: #e0e0e0 !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }

        /* Theme toggle button in sidebar */
        .theme-toggle-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: rgba(128, 128, 128, 0.08);
            color: #888;
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 0;
        }
        [data-theme="light"] .theme-toggle-btn {
            background: #f0f0f2;
            color: #555;
            border-color: #d0d0d0;
        }
        .theme-toggle-btn:hover {
            background: var(--accent-dim);
            color: var(--accent);
            border-color: var(--accent);
        }
        .theme-toggle-btn svg { width: 18px; height: 18px; }
    `;
    document.head.appendChild(style);
})();

window.initTheme = function() {
    var saved = localStorage.getItem('pi-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    // Update toggle button icons after DOM is ready
    setTimeout(function() { window._updateThemeIcons(); }, 100);
};

window.toggleTheme = function() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pi-theme', next);
    window._updateThemeIcons();
};

window._updateThemeIcons = function() {
    var isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
    // Sun icon for dark mode (click to go light), moon icon for light mode (click to go dark)
    var sunSvg = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/></svg>';
    var moonSvg = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/></svg>';
    document.querySelectorAll('.theme-toggle-btn').forEach(function(btn) {
        btn.innerHTML = isDark ? sunSvg : moonSvg;
        btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    });
};

// Apply theme immediately on script load
window.initTheme();

// ============================================================
// PAGE TRANSITIONS (smooth fade between pages)
// ============================================================
window.PAGE_TRANSITION_CSS = `
    body { opacity: 1; transition: opacity 0.2s ease-out; }
    body.page-fade-in { animation: pageFadeIn 0.3s ease-out forwards; }
    body.page-fade-out { opacity: 0; pointer-events: none; }
    @keyframes pageFadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

// Client sidebar CSS (injected once per page)
window.CLIENT_SIDEBAR_CSS = `
    .client-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        width: 60px;
        height: 100vh;
        background: rgba(10, 10, 10, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-right: 1px solid rgba(42, 42, 42, 0.6);
        z-index: 200;
        display: flex;
        flex-direction: column;
        transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden;
        will-change: width;
    }
    .client-sidebar:hover {
        width: 240px;
    }
    .cs-logo {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 0;
        padding-left: 15px;
        border-bottom: 1px solid #1e2433;
        flex-shrink: 0;
        height: 68px;
        overflow: hidden;
        transition: padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .client-sidebar:hover .cs-logo {
        padding-left: 16px;
    }
    .cs-logo img {
        width: 30px;
        height: 30px;
        object-fit: contain;
        flex-shrink: 0;
        filter: drop-shadow(0 0 8px rgba(59, 109, 255, 0.4));
    }
    .cs-logo-text {
        font-family: 'Gilroy ExtraBold', 'Manrope', sans-serif;
        font-size: 16px;
        font-weight: 800;
        background: linear-gradient(135deg, #9dbcff 0%, #3b6dff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.15s ease 0.05s;
    }
    .client-sidebar:hover .cs-logo-text {
        opacity: 1;
    }
    .client-sidebar-nav {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 16px 0;
        gap: 2px;
        overflow-y: auto;
        overflow-x: hidden;
    }
    .cs-nav-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 0;
        padding-left: 19px;
        margin: 0 6px;
        border-radius: 10px;
        text-decoration: none;
        color: #9ca3af;
        transition: all 0.2s ease;
        white-space: nowrap;
        min-height: 44px;
        position: relative;
    }
    .client-sidebar:hover .cs-nav-item {
        padding-left: 16px;
    }
    .cs-nav-item:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #ffffff;
    }
    .cs-nav-item.active {
        background: rgba(255, 255, 255, 0.04);
        color: #3b6dff;
    }
    .cs-nav-item.active::before {
        content: '';
        position: absolute;
        left: 0;
        top: 25%;
        height: 50%;
        width: 2px;
        background: #3b6dff;
        border-radius: 2px;
    }
    .cs-nav-icon {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .cs-nav-icon svg {
        width: 22px;
        height: 22px;
    }
    .cs-nav-label {
        font-size: 14px;
        font-weight: 600;
        opacity: 0;
        transition: opacity 0.15s ease 0.05s;
    }
    .client-sidebar:hover .cs-nav-label {
        opacity: 1;
    }
    .cs-bottom {
        border-top: 1px solid #1e2433;
        padding: 8px 0;
        flex-shrink: 0;
    }
    .cs-signout {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 0;
        padding-left: 20px;
        margin: 0 6px;
        border-radius: 10px;
        text-decoration: none;
        color: #9ca3af;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        background: none;
        font-family: 'Manrope', sans-serif;
        font-size: 14px;
        width: calc(100% - 12px);
        white-space: nowrap;
        min-height: 44px;
    }
    .client-sidebar:hover .cs-signout {
        padding-left: 16px;
    }
    .cs-signout:hover {
        background: rgba(239, 68, 68, 0.08);
        color: #ef4444;
    }
    .cs-signout svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
    }
    .cs-signout-label {
        font-size: 13px;
        font-weight: 600;
        opacity: 0;
        transition: opacity 0.15s ease 0.05s;
    }
    .client-sidebar:hover .cs-signout-label {
        opacity: 1;
    }
    .cs-main-content {
        padding-left: 60px;
        min-height: 100vh;
        transition: padding-left 0.25s ease;
    }
    /* Mobile sidebar */
    .cs-mobile-toggle {
        display: none;
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 201;
        background: rgba(20, 20, 20, 0.9);
        border: 1px solid #1e2433;
        border-radius: 10px;
        padding: 10px;
        cursor: pointer;
        color: #ffffff;
    }
    .cs-mobile-toggle svg {
        width: 22px;
        height: 22px;
        display: block;
    }
    .cs-overlay {
        display: none;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        z-index: 199;
    }
    @media (max-width: 768px) {
        .client-sidebar {
            transform: translateX(-100%);
            width: 240px;
        }
        .client-sidebar.open {
            transform: translateX(0);
        }
        .client-sidebar.open .cs-nav-item {
            justify-content: flex-start;
            padding-left: 16px;
        }
        .client-sidebar.open .cs-signout {
            justify-content: flex-start;
            padding-left: 16px;
        }
        .client-sidebar.open .cs-nav-label,
        .client-sidebar.open .cs-logo-text,
        .client-sidebar.open .cs-signout-label {
            opacity: 1;
        }
        .cs-overlay.open {
            display: block;
        }
        .cs-mobile-toggle {
            display: block;
        }
        .cs-main-content {
            padding-left: 0;
        }
    }
`;

// Notification system CSS (injected once per page)
window.NOTIFICATION_SYSTEM_CSS = `
    /* Bell icon */
    .notif-bell {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.1);
        color: #e5e7eb;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 300;
        transition: background 0.2s, transform 0.15s;
    }
    .notif-bell:hover {
        background: rgba(255,255,255,0.14);
        transform: scale(1.05);
    }
    .notif-bell svg { width: 20px; height: 20px; }
    .notif-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        background: #ef4444;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        line-height: 1;
    }
    .notif-badge.hidden { display: none; }

    /* Dropdown */
    .notif-dropdown {
        position: fixed;
        top: 64px;
        right: 16px;
        width: 360px;
        max-height: 480px;
        background: rgba(20,20,20,0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        z-index: 301;
        overflow: hidden;
        display: none;
        box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    }
    .notif-dropdown.open { display: block; }
    .notif-dd-header {
        padding: 14px 16px;
        font-weight: 700;
        font-size: 14px;
        color: #f5f5f5;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-family: 'Gilroy-ExtraBold', sans-serif;
    }
    .notif-dd-list {
        overflow-y: auto;
        max-height: 420px;
        padding: 6px 0;
    }
    .notif-dd-empty {
        padding: 32px 16px;
        text-align: center;
        color: #8b919a;
        font-size: 13px;
    }
    .notif-dd-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 16px;
        cursor: pointer;
        transition: background 0.15s;
    }
    .notif-dd-item:hover { background: rgba(255,255,255,0.05); }
    .notif-dd-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #3b6dff;
        flex-shrink: 0;
        margin-top: 5px;
    }
    .notif-dd-body { flex: 1; min-width: 0; }
    .notif-dd-title {
        font-weight: 600;
        font-size: 13px;
        color: #f5f5f5;
        margin-bottom: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .notif-dd-preview {
        font-size: 12px;
        color: #8b919a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .notif-dd-time {
        font-size: 11px;
        color: #6b7280;
        flex-shrink: 0;
        margin-top: 2px;
    }

    /* Modal overlay */
    .notif-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 400;
        display: none;
        align-items: center;
        justify-content: center;
    }
    .notif-modal-overlay.open { display: flex; }
    .notif-modal {
        background: rgba(20,20,20,0.97);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(59, 109, 255,0.25);
        border-radius: 14px;
        width: 480px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
        padding: 28px;
        position: relative;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    }
    .notif-modal-close {
        position: absolute;
        top: 14px;
        right: 14px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
        border: none;
        color: #9ca3af;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.15s, color 0.15s;
    }
    .notif-modal-close:hover { background: rgba(255,255,255,0.15); color: #fff; }
    .notif-modal-title {
        font-family: 'Gilroy-ExtraBold', sans-serif;
        font-size: 20px;
        color: #f5f5f5;
        margin-bottom: 6px;
        padding-right: 36px;
    }
    .notif-modal-meta {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 18px;
    }
    .notif-modal-message {
        font-size: 14px;
        color: #d1d5db;
        line-height: 1.65;
        white-space: pre-wrap;
    }

    /* Toast container */
    .notif-toast-container {
        position: fixed;
        top: 68px;
        right: 16px;
        z-index: 350;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        max-width: 340px;
    }
    .notif-toast {
        background: rgba(20,20,20,0.95);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(59, 109, 255,0.3);
        border-radius: 10px;
        padding: 12px 16px;
        pointer-events: auto;
        cursor: pointer;
        animation: notifSlideIn 0.35s ease-out;
        transition: opacity 0.3s, transform 0.3s;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .notif-toast.removing {
        opacity: 0;
        transform: translateX(100%);
    }
    .notif-toast-title {
        font-weight: 600;
        font-size: 13px;
        color: #f5f5f5;
        margin-bottom: 3px;
    }
    .notif-toast-preview {
        font-size: 12px;
        color: #8b919a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    @keyframes notifSlideIn {
        from { opacity: 0; transform: translateX(100%); }
        to { opacity: 1; transform: translateX(0); }
    }

    /* Mobile responsive */
    @media (max-width: 600px) {
        .notif-bell { top: 12px; right: 12px; width: 36px; height: 36px; }
        .notif-bell svg { width: 18px; height: 18px; }
        .notif-dropdown { right: 8px; left: 8px; width: auto; top: 56px; }
        .notif-modal { width: 95vw; padding: 20px; }
        .notif-toast-container { right: 8px; left: 8px; max-width: none; top: 56px; }
    }
`;

// Chat widget CSS (Intercom-style floating chat)
window.CHAT_WIDGET_CSS = `
    .cw-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b6dff 0%, #2a4fd6 100%);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 290;
        box-shadow: 0 4px 20px rgba(59, 109, 255, 0.35);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .cw-bubble:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 28px rgba(59, 109, 255, 0.5);
    }
    .cw-bubble svg { width: 26px; height: 26px; color: #06070c; }
    .cw-bubble-badge {
        position: absolute;
        top: -4px; right: -4px;
        min-width: 18px; height: 18px;
        border-radius: 9px;
        background: #ef4444;
        border: 2px solid #06070c;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        padding: 0 4px;
        font-family: 'Manrope', sans-serif;
    }
    .cw-bubble-badge.visible { display: flex; }

    .cw-panel {
        position: fixed;
        bottom: 92px;
        right: 24px;
        width: 360px;
        max-height: calc(100vh - 120px);
        background: rgba(14, 14, 14, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(59, 109, 255, 0.15);
        border-radius: 16px;
        z-index: 295;
        display: none;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 16px 60px rgba(0, 0, 0, 0.6);
        animation: cwSlideUp 0.25s ease-out;
    }
    .cw-panel.open { display: flex; }
    @keyframes cwSlideUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .cw-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        flex-shrink: 0;
    }
    .cw-header-info { flex: 1; min-width: 0; }
    .cw-header-name { font-weight: 700; font-size: 14px; color: #f5f5f5; }
    .cw-status-row { display: flex; align-items: center; gap: 5px; margin-top: 3px; }
    .cw-status-dot {
        width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
        box-shadow: 0 0 5px rgba(34,197,94,0.6);
    }
    .cw-status-dot.offline { background: none; width: auto; height: auto; box-shadow: none; }
    .cw-status-dot.offline svg { width: 11px; height: 11px; color: #9ca3af; display: block; }
    .cw-status-text { font-size: 11px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cw-hours-text { font-size: 11px; color: #9ca3af; margin-top: 2px; line-height: 1.3; }
    .cwt-view-all {
        font-size: 12px;
        color: #3b6dff;
        text-decoration: none;
        font-weight: 600;
        flex-shrink: 0;
        transition: opacity 0.15s;
    }
    .cwt-view-all:hover { opacity: 0.75; }
    .cw-close {
        width: 28px; height: 28px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.06); border: none;
        color: #9ca3af; cursor: pointer; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
    }
    .cw-close:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
    .cw-close svg { width: 14px; height: 14px; }

    /* Ticket hub body */
    .cwt-body {
        flex: 1; overflow-y: auto; padding: 10px 10px 4px;
        display: flex; flex-direction: column;
        min-height: 80px;
    }
    .cwt-body::-webkit-scrollbar { width: 3px; }
    .cwt-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

    .cwt-section-label {
        font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
        color: #6b7280; padding: 6px 4px 4px; font-weight: 600;
    }

    .cwt-ticket {
        display: block; padding: 10px 12px; border-radius: 10px;
        margin-bottom: 5px; text-decoration: none;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        cursor: pointer; transition: background 0.15s, border-color 0.15s;
    }
    .cwt-ticket:hover { background: rgba(255,255,255,0.08); }
    .cwt-ticket.unread { border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.04); }

    .cwt-ticket-top {
        display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
    }
    .cwt-ticket-dot {
        width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    }
    .cwt-ticket-dot.open { background: #3b6dff; }
    .cwt-ticket-dot.in_progress { background: #3b82f6; }
    .cwt-ticket-dot.resolved { background: #22c55e; }
    .cwt-ticket-dot.closed { background: #6b7280; }

    .cwt-ticket-title {
        font-size: 12.5px; font-weight: 600; color: #e5e7eb;
        flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cwt-unread-badge {
        background: #ef4444; color: #fff; font-size: 9px; font-weight: 700;
        border-radius: 8px; padding: 1px 5px; flex-shrink: 0;
    }
    .cwt-ticket-preview {
        font-size: 11.5px; color: #9ca3af;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        padding-left: 13px;
    }
    .cwt-ticket-time {
        font-size: 10px; color: #6b7280; padding-left: 13px; margin-top: 2px;
    }

    .cwt-empty {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        text-align: center; padding: 28px 20px; color: #6b7280;
        font-size: 13px; gap: 6px;
    }

    .cwt-footer {
        padding: 10px 12px 12px;
        border-top: 1px solid rgba(255,255,255,0.07);
        flex-shrink: 0;
    }
    .cwt-new-btn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; padding: 10px; border-radius: 10px;
        background: linear-gradient(135deg, #3b6dff, #2a4fd6);
        border: none; color: #06070c; font-family: 'Manrope', sans-serif;
        font-size: 13px; font-weight: 700; cursor: pointer;
        transition: opacity 0.2s, transform 0.15s;
    }
    .cwt-new-btn:hover { opacity: 0.9; transform: translateY(-1px); }

    @media (max-width: 600px) {
        .cw-panel { right: 0; bottom: 0; left: 0; width: 100%; max-height: 100vh; border-radius: 0; }
        .cw-bubble { bottom: 16px; right: 16px; width: 50px; height: 50px; }
    }
`;

// Client sidebar HTML builder (function so logoPath resolves at call time)
window.buildClientSidebarHTML = function(logoPath) {
    return `
    <button class="cs-mobile-toggle" onclick="toggleClientSidebar()">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
    </button>
    <div class="cs-overlay" id="cs-overlay" onclick="toggleClientSidebar()"></div>
    <nav class="client-sidebar" id="client-sidebar">
        <div class="cs-logo">
            <img src="${logoPath || 'logo.png'}" alt="VantageQuant">
            <span class="cs-logo-text">VantageQuant</span>
        </div>
        <div class="client-sidebar-nav"></div>
        <div class="cs-bottom">
            <button class="theme-toggle-btn" onclick="window.toggleTheme()" title="Toggle theme" style="margin:0 auto 8px;"></button>
            <button class="cs-signout" onclick="window.signOut()">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                <span class="cs-signout-label">Sign Out</span>
            </button>
        </div>
    </nav>`;
};

window.toggleClientSidebar = function() {
    document.getElementById('client-sidebar').classList.toggle('open');
    document.getElementById('cs-overlay').classList.toggle('open');
};

window.injectClientSidebar = function(activePage, logoPath, userStatus) {
    // Inject CSS
    if (!document.getElementById('client-sidebar-css')) {
        const style = document.createElement('style');
        style.id = 'client-sidebar-css';
        style.textContent = window.CLIENT_SIDEBAR_CSS;
        document.head.appendChild(style);
    }
    // Inject notification CSS
    if (!document.getElementById('notif-system-css')) {
        const nStyle = document.createElement('style');
        nStyle.id = 'notif-system-css';
        nStyle.textContent = window.NOTIFICATION_SYSTEM_CSS;
        document.head.appendChild(nStyle);
    }
    // Inject HTML
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = window.buildClientSidebarHTML(logoPath);
        window.applyClientSidebar(activePage, userStatus);
    }
    // Inject notification UI elements
    if (!document.getElementById('notif-bell')) {
        // Bell button
        const bell = document.createElement('button');
        bell.id = 'notif-bell';
        bell.className = 'notif-bell';
        bell.onclick = function() { window._toggleNotifDropdown(); };
        bell.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg><span class="notif-badge hidden" id="notif-badge">0</span>';
        document.body.appendChild(bell);

        // Dropdown
        const dd = document.createElement('div');
        dd.id = 'notif-dropdown';
        dd.className = 'notif-dropdown';
        dd.innerHTML = '<div class="notif-dd-header">Notifications</div><div class="notif-dd-list" id="notif-dd-list"></div>';
        document.body.appendChild(dd);

        // Modal overlay
        const modal = document.createElement('div');
        modal.id = 'notif-modal-overlay';
        modal.className = 'notif-modal-overlay';
        modal.innerHTML = '<div class="notif-modal" id="notif-modal"><button class="notif-modal-close" id="notif-modal-close">&times;</button><div class="notif-modal-title" id="notif-modal-title"></div><div class="notif-modal-meta" id="notif-modal-meta"></div><div class="notif-modal-message" id="notif-modal-message"></div></div>';
        document.body.appendChild(modal);

        // Toast container
        const tc = document.createElement('div');
        tc.id = 'notif-toast-container';
        tc.className = 'notif-toast-container';
        document.body.appendChild(tc);

        // Close dropdown on outside click
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('notif-dropdown');
            const bellEl = document.getElementById('notif-bell');
            if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target) && !bellEl.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });

        // Modal close button
        document.getElementById('notif-modal-close').onclick = function() { window._closeNotifModal(true); };
        // Close modal on overlay click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) window._closeNotifModal(true);
        });

        // Init notification system (async, non-blocking)
        window.initNotificationSystem();
    }

    // Inject page transition CSS
    if (!document.getElementById('page-transition-css')) {
        const tStyle = document.createElement('style');
        tStyle.id = 'page-transition-css';
        tStyle.textContent = window.PAGE_TRANSITION_CSS;
        document.head.appendChild(tStyle);
    }
    document.body.classList.add('page-fade-in');

    // Intercept all internal links for smooth transitions
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href]');
        if (!link) return;
        var href = link.getAttribute('href');
        if (!href) return;
        if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        window._navigateWithTransition(href);
    });

    // Init chat widget (async, non-blocking)
    window._initChatWidget();
};

// ============================================================
// CRM HELPER FUNCTIONS
// ============================================================

// Mark onboarding as complete
window.markOnboardingComplete = async function(userId) {
    const { error } = await window.supabaseClient
        .from('users')
        .update({
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
            status: 'member'
        })
        .eq('id', userId);

    if (error) {
        console.error('Error marking onboarding complete:', error);
        return false;
    }
    return true;
};

// Mark trial onboarding as complete (keeps free_trial status, sets onboarding done)
window.markTrialOnboardingComplete = async function(userId) {
    const { error } = await window.supabaseClient
        .from('users')
        .update({
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString()
        })
        .eq('id', userId);

    if (error) {
        console.error('Error marking trial onboarding complete:', error);
        return false;
    }
    return true;
};

// Get free trial configuration from admin_settings
window.getFreeTrialConfig = async function() {
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'free_trial_config')
            .single();
        if (error) throw error;
        return data?.value || null;
    } catch (err) {
        console.error('Error loading free trial config:', err);
        return null;
    }
};

// Update user status (also syncs onboarding_completed flag)
window.updateUserStatus = async function(userId, status) {
    const isCompleted = ['member', 'verified_member', 'active'].includes(status);
    const updateData = {
        status: status,
        onboarding_completed: isCompleted
    };
    if (isCompleted) {
        updateData.onboarding_completed_at = new Date().toISOString();
    }

    const { error } = await window.supabaseClient
        .from('users')
        .update(updateData)
        .eq('id', userId);

    if (error) {
        console.error('Error updating user status:', error);
        return false;
    }
    return true;
};

// Delete a user (admin only) - removes from both public.users and auth.users
window.deleteUser = async function(userId) {
    const { error } = await window.supabaseClient.rpc('admin_delete_user', {
        target_user_id: userId
    });

    if (error) {
        console.error('Error deleting user:', error);
        // Fallback: try deleting from public.users only
        const { error: fallbackError } = await window.supabaseClient
            .from('users')
            .delete()
            .eq('id', userId);
        if (fallbackError) {
            console.error('Fallback delete also failed:', fallbackError);
            return false;
        }
    }
    return true;
};

// Update user notes (admin)
window.updateUserNotes = async function(userId, notes) {
    const { error } = await window.supabaseClient
        .from('users')
        .update({ notes: notes })
        .eq('id', userId);

    if (error) {
        console.error('Error updating user notes:', error);
        return false;
    }
    return true;
};

// Fetch activity log for a user
window.getActivityLog = async function(userId, limit = 50, offset = 0) {
    const { data, error } = await window.supabaseClient
        .from('activity_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching activity log:', error);
        return [];
    }
    return data;
};

// Fetch all announcements (published only for clients)
window.getAnnouncements = async function(publishedOnly = true) {
    let query = window.supabaseClient
        .from('announcements')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

    if (publishedOnly) {
        query = query.eq('is_published', true);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching announcements:', error);
        return [];
    }
    return data;
};

// Fetch content posts (published only for clients)
window.getContentPosts = async function(publishedOnly = true, category = null) {
    let query = window.supabaseClient
        .from('content_posts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (publishedOnly) {
        query = query.eq('is_published', true);
    }
    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching content posts:', error);
        return [];
    }
    return data;
};

// ============================================================
// ONBOARDING / VERIFICATION HELPERS
// ============================================================

// Fetch payment plan options from admin_settings
window.getPaymentPlans = async function() {
    try {
        var result = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'payment_plans')
            .single();
        if (result.error) throw result.error;
        return (result.data && result.data.value && result.data.value.options) || [];
    } catch (err) {
        console.error('Error fetching payment plans:', err);
        return [];
    }
};

// Fetch contract config from admin_settings
window.getContractConfig = async function() {
    try {
        var result = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'contract_config')
            .single();
        if (result.error) throw result.error;
        return (result.data && result.data.value) || {};
    } catch (err) {
        console.error('Error fetching contract config:', err);
        return {};
    }
};

// Upload verification photo to Supabase Storage
// Returns an object: { path, publicUrl }
window.uploadVerificationPhoto = async function(userId, fileBlob) {
    try {
        var filePath = userId + '/verification.jpg';
        var result = await window.supabaseClient.storage
            .from('verification-photos')
            .upload(filePath, fileBlob, { contentType: 'image/jpeg', upsert: true });
        if (result.error) throw result.error;
        // Get public URL (bucket is public)
        var urlResult = window.supabaseClient.storage
            .from('verification-photos')
            .getPublicUrl(filePath);
        var publicUrl = (urlResult.data && urlResult.data.publicUrl) || null;
        return { path: filePath, publicUrl: publicUrl };
    } catch (err) {
        console.error('Error uploading verification photo:', err);
        return null;
    }
};

// Get public URL for verification photo (bucket is public, no signing needed)
window.getVerificationPhotoUrl = function(photoPath) {
    try {
        // If it's already a full URL, return as-is
        if (photoPath && photoPath.startsWith('http')) return photoPath;
        var urlResult = window.supabaseClient.storage
            .from('verification-photos')
            .getPublicUrl(photoPath);
        return (urlResult.data && urlResult.data.publicUrl) || null;
    } catch (err) {
        console.error('Error getting photo URL:', err);
        return null;
    }
};

// Save verification/contract data to users table
window.saveVerificationData = async function(userId, verificationData) {
    try {
        var result = await window.supabaseClient
            .from('users')
            .update(verificationData)
            .eq('id', userId);
        if (result.error) throw result.error;
        return true;
    } catch (err) {
        console.error('Error saving verification data:', err);
        return false;
    }
};

// Fetch notifications for current user
window.getNotifications = async function() {
    const { data, error } = await window.supabaseClient
        .from('push_notifications')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }
    return data;
};

// Dismiss a notification
window.dismissNotification = async function(notificationId, userId) {
    const { data: notif } = await window.supabaseClient
        .from('push_notifications')
        .select('is_read_by')
        .eq('id', notificationId)
        .single();

    if (notif) {
        const readBy = notif.is_read_by || [];
        if (!readBy.includes(userId)) {
            readBy.push(userId);
            await window.supabaseClient
                .from('push_notifications')
                .update({ is_read_by: readBy })
                .eq('id', notificationId);
        }
    }
};

// Trigger an N8N workflow
window.triggerWorkflow = async function(workflowId, customerData, triggeredByEmail) {
    const { data: workflow, error } = await window.supabaseClient
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

    if (error || !workflow) {
        console.error('Error fetching workflow:', error);
        return { success: false, error: 'Workflow not found' };
    }

    const payload = {
        event: 'workflow_trigger',
        workflow_id: workflowId,
        workflow_name: workflow.name,
        customer: customerData,
        triggered_by: triggeredByEmail,
        timestamp: new Date().toISOString()
    };

    try {
        const response = await fetch(workflow.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const status = response.ok ? 'success' : 'failed';

        // Log the execution
        await window.supabaseClient.from('workflow_executions').insert({
            workflow_id: workflowId,
            user_id: customerData.id,
            status: status,
            response: { status_code: response.status },
            triggered_by: customerData.triggered_by_id
        });

        return { success: response.ok, status: response.status };
    } catch (err) {
        await window.supabaseClient.from('workflow_executions').insert({
            workflow_id: workflowId,
            user_id: customerData.id,
            status: 'failed',
            response: { error: err.message },
            triggered_by: customerData.triggered_by_id
        });
        return { success: false, error: err.message };
    }
};

// ============================================================
// AI CHAT CONFIG
// ============================================================

window.getAIChatConfig = async function() {
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'ai_chat_config')
            .maybeSingle();
        if (error) throw error;
        return data?.value || {};
    } catch (err) {
        return { enabled: true, webhook_url: '', greeting_message: 'Hi! How can I help you today?', ai_display_name: 'Support Team' };
    }
};

window.updateAIChatConfig = async function(config) {
    const { error } = await window.supabaseClient
        .from('admin_settings')
        .upsert({ key: 'ai_chat_config', value: config, updated_at: new Date().toISOString() });
    if (error) { console.error('Error updating AI config:', error); return false; }
    return true;
};

// ============================================================
// CONVERSATION HANDLER MANAGEMENT
// ============================================================

window.setConversationHandler = async function(conversationId, handlerType, adminId) {
    const updateData = { handler_type: handlerType };
    if (handlerType === 'human' && adminId) {
        updateData.assigned_admin_id = adminId;
        updateData.category = 'open';
    } else if (handlerType === 'ai') {
        updateData.assigned_admin_id = null;
        updateData.category = 'ai';
    }
    const { error } = await window.supabaseClient
        .from('chat_conversations')
        .update(updateData)
        .eq('id', conversationId);
    if (error) { console.error('Error setting handler:', error); return false; }
    return true;
};

window.escalateConversation = async function(conversationId) {
    const { error } = await window.supabaseClient
        .from('chat_conversations')
        .update({
            is_escalated: true,
            escalated_at: new Date().toISOString(),
            handler_type: 'human',
            category: 'escalated'
        })
        .eq('id', conversationId);
    if (error) { console.error('Error escalating:', error); return false; }
    return true;
};

window.getConversationCategory = function(conv) {
    if (conv.status === 'closed') return 'closed';
    if (conv.status === 'resolved') return 'resolved';
    if (conv.is_escalated) return 'escalated';
    if (conv.handler_type === 'ai') return 'ai';
    return 'open';
};

// ============================================================
// USER TAGS
// ============================================================

window.getUserTags = function(profile) {
    return Array.isArray(profile?.tags) ? profile.tags : [];
};

window.addUserTag = async function(userId, tag) {
    const profile = await window.getUserProfile(userId);
    if (!profile) return false;
    const tags = Array.isArray(profile.tags) ? [...profile.tags] : [];
    if (tags.includes(tag)) return true;
    tags.push(tag);
    const { error } = await window.supabaseClient
        .from('users')
        .update({ tags })
        .eq('id', userId);
    if (error) { console.error('Error adding tag:', error); return false; }
    return true;
};

window.removeUserTag = async function(userId, tag) {
    const profile = await window.getUserProfile(userId);
    if (!profile) return false;
    const tags = (Array.isArray(profile.tags) ? profile.tags : []).filter(t => t !== tag);
    const { error } = await window.supabaseClient
        .from('users')
        .update({ tags })
        .eq('id', userId);
    if (error) { console.error('Error removing tag:', error); return false; }
    return true;
};

// Format relative time
window.formatRelativeTime = function(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Format full date
window.formatFullDate = function(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================

window._notifState = {
    notifications: [],
    userId: null,
    userStatus: null,
    subscription: null,
    initialized: false
};

// Get unread (not dismissed, not expired) notifications
window._getUnreadNotifications = function() {
    const now = new Date();
    return window._notifState.notifications.filter(function(n) {
        if (n.expires_at && new Date(n.expires_at) < now) return false;
        const readBy = n.is_read_by || [];
        return !readBy.includes(window._notifState.userId);
    });
};

// Update the red badge count
window._updateNotifBadge = function() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = window._getUnreadNotifications();
    const count = unread.length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.toggle('hidden', count === 0);
};

// Render dropdown list with unread notifications
window._renderNotifDropdown = function() {
    const list = document.getElementById('notif-dd-list');
    if (!list) return;
    const unread = window._getUnreadNotifications();
    if (unread.length === 0) {
        list.innerHTML = '<div class="notif-dd-empty">No new notifications</div>';
        return;
    }
    list.innerHTML = unread.map(function(n) {
        const preview = (n.message || '').substring(0, 60) + ((n.message || '').length > 60 ? '...' : '');
        const time = window.formatRelativeTime(n.created_at);
        return '<div class="notif-dd-item" data-id="' + n.id + '"><div class="notif-dd-dot"></div><div class="notif-dd-body"><div class="notif-dd-title">' + _escNotif(n.title) + '</div><div class="notif-dd-preview">' + _escNotif(preview) + '</div></div><div class="notif-dd-time">' + time + '</div></div>';
    }).join('');
    // Click handlers
    list.querySelectorAll('.notif-dd-item').forEach(function(item) {
        item.onclick = function() {
            const id = item.getAttribute('data-id');
            const notif = window._notifState.notifications.find(function(n) { return n.id === id; });
            if (notif) window._openNotifModal(notif);
        };
    });
};

// HTML escape helper
function _escNotif(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// Toggle dropdown open/close
window._toggleNotifDropdown = function() {
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    const isOpen = dd.classList.contains('open');
    if (!isOpen) window._renderNotifDropdown();
    dd.classList.toggle('open');
};

// Open modal with full notification content
window._openNotifModal = function(notification) {
    // Close dropdown
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.classList.remove('open');

    document.getElementById('notif-modal-title').textContent = notification.title || '';
    document.getElementById('notif-modal-meta').textContent = window.formatFullDate(notification.created_at);
    document.getElementById('notif-modal-message').textContent = notification.message || '';

    const overlay = document.getElementById('notif-modal-overlay');
    overlay.classList.add('open');
    overlay._currentNotifId = notification.id;
};

// Close modal and optionally dismiss the notification
window._closeNotifModal = function(shouldDismiss) {
    const overlay = document.getElementById('notif-modal-overlay');
    if (!overlay) return;
    const notifId = overlay._currentNotifId;
    overlay.classList.remove('open');
    overlay._currentNotifId = null;

    if (shouldDismiss && notifId && window._notifState.userId) {
        // Optimistic local update
        const notif = window._notifState.notifications.find(function(n) { return n.id === notifId; });
        if (notif) {
            if (!notif.is_read_by) notif.is_read_by = [];
            if (!notif.is_read_by.includes(window._notifState.userId)) {
                notif.is_read_by.push(window._notifState.userId);
            }
        }
        window._updateNotifBadge();
        // Persist to DB
        window.dismissNotification(notifId, window._notifState.userId);
    }
};

// Show a toast notification
window._showNotifToast = function(notification) {
    const container = document.getElementById('notif-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    const preview = (notification.message || '').substring(0, 80) + ((notification.message || '').length > 80 ? '...' : '');
    toast.innerHTML = '<div class="notif-toast-title">' + _escNotif(notification.title) + '</div><div class="notif-toast-preview">' + _escNotif(preview) + '</div>';
    toast.onclick = function() {
        toast.classList.add('removing');
        setTimeout(function() { toast.remove(); }, 300);
        window._openNotifModal(notification);
    };
    container.appendChild(toast);
    // Auto-remove after 5 seconds
    setTimeout(function() {
        if (toast.parentNode) {
            toast.classList.add('removing');
            setTimeout(function() { toast.remove(); }, 300);
        }
    }, 5000);
};

// Fetch all notifications from DB
window._fetchNotifications = async function() {
    const data = await window.getNotifications();
    window._notifState.notifications = data || [];
    window._updateNotifBadge();
};

// Subscribe to real-time notification inserts
window._subscribeNotifications = function() {
    if (window._notifState.subscription) return;
    const channel = window.supabaseClient
        .channel('client-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'push_notifications' }, function(payload) {
            const newNotif = payload.new;
            if (!newNotif) return;
            // Client-side target check
            const target = newNotif.target;
            const uid = window._notifState.userId;
            const status = window._notifState.userStatus;
            if (target !== 'all' && target !== status && target !== uid) return;
            // Check not expired
            if (newNotif.expires_at && new Date(newNotif.expires_at) < new Date()) return;
            // Add to local state
            window._notifState.notifications.unshift(newNotif);
            window._updateNotifBadge();
            window._showNotifToast(newNotif);
        })
        .subscribe();
    window._notifState.subscription = channel;
};

// Initialize the notification system
window.initNotificationSystem = async function() {
    if (window._notifState.initialized) return;

    // Check if user is authenticated
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session || !session.user) return;

    // Skip for admin users
    const { data: userData } = await window.supabaseClient
        .from('users')
        .select('is_admin, status')
        .eq('id', session.user.id)
        .single();

    if (!userData || userData.is_admin) return;

    window._notifState.userId = session.user.id;
    window._notifState.userStatus = userData.status || '';
    window._notifState.initialized = true;

    // Fetch existing notifications
    await window._fetchNotifications();

    // Show toasts for unread on login (max 3, staggered)
    const unread = window._getUnreadNotifications();
    const toShow = unread.slice(0, 3);
    toShow.forEach(function(n, i) {
        setTimeout(function() { window._showNotifToast(n); }, i * 800);
    });

    // Subscribe to real-time
    window._subscribeNotifications();
};

// ============================================================
// CHAT WIDGET (Intercom-style floating chat)
// ============================================================

window._chatWidgetState = {
    isOpen: false,
    initialized: false,
    userId: null,
    displayName: 'Support Team',
    unreadCount: 0,
    ticketSubscription: null,
    supportStatus: 'online',   // 'online' | 'offline'
    supportHours: ''
};

// Initialize chat widget
window._initChatWidget = async function() {
    if (window._chatWidgetState.initialized) return;

    // Skip on the full chat/support page
    var path = window.location.pathname;
    if (path.indexOf('/portal/chat') !== -1) return;

    // Check auth
    var sessionResult = await window.supabaseClient.auth.getSession();
    var session = sessionResult.data.session;
    if (!session || !session.user) return;

    // Skip admins and non-members
    var userData = await window.supabaseClient
        .from('users')
        .select('is_admin, status, first_name, last_name')
        .eq('id', session.user.id)
        .single();

    if (!userData.data || userData.data.is_admin) return;
    var userStatus = (userData.data.status || '').toLowerCase();
    if (['member', 'verified_member', 'active'].indexOf(userStatus) === -1) return;

    window._chatWidgetState.userId = session.user.id;
    window._chatWidgetState.initialized = true;

    // Load display name from AI config
    try {
        var aiConfig = await window.getAIChatConfig();
        if (aiConfig) window._chatWidgetState.displayName = aiConfig.ai_display_name || 'Support Team';
    } catch (e) {}

    // Load support availability schedule and auto-compute online/offline
    try {
        var availResult = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'support_availability')
            .maybeSingle();
        if (availResult.data && availResult.data.value) {
            var avCfg = availResult.data.value;
            // Legacy fallback: if old manual-status format, use it as-is
            if (typeof avCfg.status === 'string' && !avCfg.days) {
                window._chatWidgetState.supportStatus = avCfg.status;
                window._chatWidgetState.supportHours  = avCfg.hours_text || '';
            } else {
                // Compute from schedule
                window._chatWidgetState.supportStatus = _computeSupportStatus(avCfg);
                window._chatWidgetState.supportHours  = avCfg.hours_display || '';
            }
        }
    } catch (e) {}

    window._injectChatWidgetHTML();

    // Check for existing unread tickets and set badge
    window._checkWidgetUnread();
    // Subscribe to realtime conversation changes for live badge updates
    window._subscribeWidgetConversations();
};

// Inject widget HTML into DOM
window._injectChatWidgetHTML = function() {
    if (document.getElementById('cw-bubble')) return;

    if (!document.getElementById('cw-css')) {
        var style = document.createElement('style');
        style.id = 'cw-css';
        style.textContent = window.CHAT_WIDGET_CSS;
        document.head.appendChild(style);
    }

    // Bubble button
    var bubble = document.createElement('button');
    bubble.id = 'cw-bubble';
    bubble.className = 'cw-bubble';
    bubble.setAttribute('aria-label', 'Support tickets');
    bubble.onclick = function() { window._toggleChatWidget(); };
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="cw-bubble-badge" id="cw-badge"></span>';
    document.body.appendChild(bubble);

    // Panel
    var panel = document.createElement('div');
    panel.id = 'cw-panel';
    panel.className = 'cw-panel';
    var isOffline = window._chatWidgetState.supportStatus === 'offline';
    var hoursText = window._chatWidgetState.supportHours;
    var statusIndicator = isOffline
        ? '<span class="cw-status-dot offline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg></span>'
        : '<span class="cw-status-dot"></span>';
    var statusLabel = isOffline ? 'Out of office' : 'Online now';
    var hoursRow = hoursText
        ? '<div class="cw-hours-text">' + _escCw(hoursText) + '</div>'
        : '';

    panel.innerHTML =
        '<div class="cw-header">' +
            '<div class="cw-header-info">' +
                '<div class="cw-header-name">Support Tickets</div>' +
                '<div class="cw-status-row">' + statusIndicator + '<span class="cw-status-text">' + _escCw(statusLabel) + '</span></div>' +
                hoursRow +
            '</div>' +
            '<a class="cwt-view-all" href="/portal/chat" onclick="event.preventDefault(); window._navigateWithTransition(\'/portal/chat\');">View All →</a>' +
            '<button class="cw-close" onclick="window._toggleChatWidget()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>' +
        '<div class="cwt-body" id="cwt-body"><div class="cwt-empty">Loading...</div></div>' +
        '<div class="cwt-footer">' +
            '<button class="cwt-new-btn" onclick="window._navigateWithTransition(\'/portal/chat\')">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                'Open New Ticket' +
            '</button>' +
        '</div>';
    document.body.appendChild(panel);
};

// Compute support online/offline from a schedule config object.
// config: { days: [0..6], start_time: "HH:MM", end_time: "HH:MM", timezone: "..." }
// Returns 'online' if the current moment falls within the schedule, 'offline' otherwise.
function _computeSupportStatus(config) {
    if (!config || !Array.isArray(config.days) || !config.start_time || !config.end_time) {
        return 'online'; // no schedule configured → default to online
    }
    try {
        var tz = config.timezone || 'America/New_York';
        var now = new Date();
        var parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(now);
        var dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        var weekdayStr = (parts.find(function(p) { return p.type === 'weekday'; }) || {}).value || '';
        var currentDay = dayMap[weekdayStr];
        var hourStr   = (parts.find(function(p) { return p.type === 'hour';   }) || {}).value || '0';
        var minuteStr = (parts.find(function(p) { return p.type === 'minute'; }) || {}).value || '0';
        // Intl may return '24' for midnight in some locales — normalise
        var currentH = parseInt(hourStr, 10) % 24;
        var currentM = parseInt(minuteStr, 10);
        var currentMins = currentH * 60 + currentM;
        var startParts = config.start_time.split(':');
        var endParts   = config.end_time.split(':');
        var startMins  = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
        var endMins    = parseInt(endParts[0],   10) * 60 + parseInt(endParts[1],   10);
        var dayMatch  = config.days.indexOf(currentDay) !== -1;
        var timeMatch = currentMins >= startMins && currentMins < endMins;
        return (dayMatch && timeMatch) ? 'online' : 'offline';
    } catch (e) {
        return 'online';
    }
}

// HTML escape helper for chat widget
function _escCw(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// Toggle panel open/close
window._toggleChatWidget = function() {
    var panel = document.getElementById('cw-panel');
    if (!panel) return;
    var isOpen = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
        window._chatWidgetState.isOpen = false;
    } else {
        panel.classList.add('open');
        window._chatWidgetState.isOpen = true;
        // Clear unread badge — user is now looking at their tickets
        window._updateWidgetBadge(0);
        // Load/refresh ticket list
        window._loadWidgetTickets();
    }
};

// Update the red unread badge on the bubble
window._updateWidgetBadge = function(count) {
    window._chatWidgetState.unreadCount = count;
    var badge = document.getElementById('cw-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.classList.add('visible');
    } else {
        badge.classList.remove('visible');
        badge.textContent = '';
    }
};

// Query all user conversations and show badge if any have unread messages
window._checkWidgetUnread = async function() {
    var state = window._chatWidgetState;
    if (!state.userId) return;
    try {
        var result = await window.supabaseClient
            .from('chat_conversations')
            .select('user_unread_count')
            .eq('user_id', state.userId)
            .gt('user_unread_count', 0);
        var total = (result.data || []).reduce(function(sum, c) {
            return sum + (c.user_unread_count || 0);
        }, 0);
        window._updateWidgetBadge(total);
    } catch (e) {}
};

// Subscribe to realtime conversation changes to keep badge live
window._subscribeWidgetConversations = function() {
    var state = window._chatWidgetState;
    if (!state.userId) return;
    if (state.ticketSubscription) window.supabaseClient.removeChannel(state.ticketSubscription);

    state.ticketSubscription = window.supabaseClient
        .channel('widget-convs-' + state.userId)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'chat_conversations',
            filter: 'user_id=eq.' + state.userId
        }, function(payload) {
            if (!payload.new) return;
            var hasUnread = (payload.new.user_unread_count || 0) > 0;
            if (hasUnread) {
                // Re-query total unread across all tickets
                window._checkWidgetUnread();
                // If panel is open, refresh the list so the red dot appears
                if (state.isOpen) window._loadWidgetTickets();
            }
        })
        .subscribe();
};

// Load user's recent tickets and render them in the panel
window._loadWidgetTickets = async function() {
    var state = window._chatWidgetState;
    var body = document.getElementById('cwt-body');
    if (!body || !state.userId) return;

    try {
        var result = await window.supabaseClient
            .from('chat_conversations')
            .select('id, title, status, category, last_message_preview, last_message_at, user_unread_count, ticket_number')
            .eq('user_id', state.userId)
            .order('last_message_at', { ascending: false })
            .limit(8);

        if (result.error) throw result.error;
        window._renderWidgetTickets(result.data || []);
    } catch (e) {
        body.innerHTML = '<div class="cwt-empty">Unable to load tickets.</div>';
    }
};

// Render the ticket list inside the panel
window._renderWidgetTickets = function(tickets) {
    var body = document.getElementById('cwt-body');
    if (!body) return;

    if (tickets.length === 0) {
        body.innerHTML =
            '<div class="cwt-empty">' +
                '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.25"><path stroke-linecap="round" stroke-linejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
                '<span>No tickets yet</span>' +
                '<span style="font-size:11px;color:#4b5563;">Submit a ticket and we\'ll get you sorted</span>' +
            '</div>';
        return;
    }

    var open = tickets.filter(function(t) { return ['open', 'in_progress'].includes(t.status); });
    var closed = tickets.filter(function(t) { return ['resolved', 'closed'].includes(t.status); });

    function relativeTime(ts) {
        if (!ts) return '';
        var d = new Date(ts);
        var diff = Math.floor((Date.now() - d) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function renderTicket(t) {
        var statusClass = t.status === 'in_progress' ? 'in_progress' : (t.status === 'resolved' ? 'resolved' : (t.status === 'closed' ? 'closed' : 'open'));
        var hasUnread = (t.user_unread_count || 0) > 0;
        var numStr = t.ticket_number ? '#' + t.ticket_number + ' · ' : '';
        var title = t.title || (t.category || 'Ticket').replace(/_/g, ' ');
        var preview = t.last_message_preview || '';
        var timeStr = relativeTime(t.last_message_at);

        return '<a class="cwt-ticket' + (hasUnread ? ' unread' : '') + '" href="/portal/chat" onclick="event.preventDefault(); window._navigateWithTransition(\'/portal/chat\');">' +
            '<div class="cwt-ticket-top">' +
                '<span class="cwt-ticket-dot ' + statusClass + '"></span>' +
                '<span class="cwt-ticket-title">' + _escCw(numStr + title) + '</span>' +
                (hasUnread ? '<span class="cwt-unread-badge">' + (t.user_unread_count > 9 ? '9+' : t.user_unread_count) + ' new</span>' : '') +
            '</div>' +
            (preview ? '<div class="cwt-ticket-preview">' + _escCw(preview) + '</div>' : '') +
            (timeStr ? '<div class="cwt-ticket-time">' + _escCw(timeStr) + '</div>' : '') +
        '</a>';
    }

    var html = '';
    if (open.length > 0) {
        html += '<div class="cwt-section-label">Open Tickets</div>';
        open.forEach(function(t) { html += renderTicket(t); });
    }
    if (closed.length > 0) {
        html += '<div class="cwt-section-label">Recent</div>';
        closed.slice(0, 3).forEach(function(t) { html += renderTicket(t); });
    }
    body.innerHTML = html;
};

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (window._chatWidgetState.ticketSubscription) {
        window.supabaseClient.removeChannel(window._chatWidgetState.ticketSubscription);
    }
});

// ============================================================================
// ONBOARDING CONFIG
// ============================================================================

// Get onboarding video configuration from admin_settings
window.getOnboardingConfig = async function() {
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'onboarding_config')
            .single();
        if (error) throw error;
        return data?.value || null;
    } catch (err) {
        console.error('Error loading onboarding config:', err);
        return null;
    }
};

// ============================================================================
// TICKET SYSTEM HELPERS
// ============================================================================

// Get ticket configuration (categories, welcome message, etc.)
window.getTicketConfig = async function() {
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'ticket_config')
            .maybeSingle();
        if (error) throw error;
        return data?.value || null;
    } catch (err) {
        console.error('Error loading ticket config:', err);
        return null;
    }
};

// Create a new support ticket
window.createTicket = async function(userId, category, description, priority) {
    try {
        // Create conversation as ticket
        const { data: conv, error: convError } = await window.supabaseClient
            .from('chat_conversations')
            .insert({
                user_id: userId,
                status: 'open',
                category: category || 'general',
                priority: priority || 'medium',
                title: description ? description.substring(0, 100) : 'Support Request',
                description: description || '',
                handler_type: 'human',
                last_message_at: new Date().toISOString(),
                last_message_preview: description ? description.substring(0, 100) : 'New ticket',
                admin_unread_count: 1
            })
            .select()
            .single();

        if (convError) throw convError;

        // Add the description as the first message
        if (description) {
            const { error: msgError } = await window.supabaseClient
                .from('chat_messages')
                .insert({
                    conversation_id: conv.id,
                    sender_id: userId,
                    sender_type: 'customer',
                    content: description,
                    message_type: 'text'
                });
            if (msgError) console.error('Error creating initial message:', msgError);
        }

        return conv;
    } catch (err) {
        console.error('Error creating ticket:', err);
        return null;
    }
};

// Update ticket status
window.updateTicketStatus = async function(ticketId, status, closedBy) {
    try {
        const updateData = { status: status };
        if (status === 'closed' || status === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
            if (status === 'closed') {
                updateData.closed_at = new Date().toISOString();
                if (closedBy) updateData.closed_by = closedBy;
            }
        }
        const { error } = await window.supabaseClient
            .from('chat_conversations')
            .update(updateData)
            .eq('id', ticketId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Error updating ticket status:', err);
        return false;
    }
};

// Update ticket priority
window.updateTicketPriority = async function(ticketId, priority) {
    try {
        const { error } = await window.supabaseClient
            .from('chat_conversations')
            .update({ priority: priority })
            .eq('id', ticketId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Error updating ticket priority:', err);
        return false;
    }
};

// ============================================================================
// RESEND EMAIL HELPERS
// ============================================================================

// Get Resend configuration
window.getResendConfig = async function() {
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_settings')
            .select('value')
            .eq('key', 'resend_config')
            .single();
        if (error) throw error;
        return data?.value || null;
    } catch (err) {
        console.error('Error loading resend config:', err);
        return null;
    }
};

// Send email via Resend API
window.sendResendEmail = async function(to, subject, htmlBody) {
    try {
        const config = await window.getResendConfig();
        if (!config || !config.api_key || !config.enabled) {
            console.log('Resend not configured or disabled, skipping email');
            return false;
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + config.api_key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: (config.from_name || 'Support') + ' <' + (config.from_email || 'support@vantagequant.com') + '>',
                to: [to],
                subject: subject,
                html: htmlBody
            })
        });

        const result = await response.json();
        if (!response.ok) {
            console.error('Resend API error:', result);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error sending email via Resend:', err);
        return false;
    }
};

// Send ticket reply notification email
window.sendTicketReplyEmail = async function(customerEmail, customerName, ticketNumber, replyPreview) {
    const subject = 'Ticket #' + ticketNumber + ' - New Reply from Support';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;">' +
        '<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">' +
        '<div style="background:#06070c;padding:24px 32px;text-align:center;">' +
        '<h1 style="color:#3b6dff;margin:0;font-size:22px;">VantageQuant Support</h1>' +
        '</div>' +
        '<div style="padding:32px;">' +
        '<p style="color:#333;font-size:16px;margin-bottom:8px;">Hi ' + (customerName || 'there') + ',</p>' +
        '<p style="color:#555;font-size:14px;line-height:1.6;">Our support team has replied to your ticket <strong>#' + ticketNumber + '</strong>:</p>' +
        '<div style="background:#f9f9f9;border-left:4px solid #3b6dff;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">' +
        '<p style="color:#333;font-size:14px;margin:0;line-height:1.6;">' + (replyPreview || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' +
        '</div>' +
        '<a href="https://dash.vantagequant.com/portal/chat.html" style="display:inline-block;background:#3b6dff;color:#06070c;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-top:12px;">View Full Reply</a>' +
        '<p style="color:#999;font-size:12px;margin-top:24px;">If you did not create this ticket, please ignore this email.</p>' +
        '</div>' +
        '</div></body></html>';

    return await window.sendResendEmail(customerEmail, subject, html);
};

// Send ticket created confirmation email
window.sendTicketCreatedEmail = async function(customerEmail, customerName, ticketNumber, category) {
    const subject = 'Ticket #' + ticketNumber + ' - We received your request';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;">' +
        '<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">' +
        '<div style="background:#06070c;padding:24px 32px;text-align:center;">' +
        '<h1 style="color:#3b6dff;margin:0;font-size:22px;">VantageQuant Support</h1>' +
        '</div>' +
        '<div style="padding:32px;">' +
        '<p style="color:#333;font-size:16px;margin-bottom:8px;">Hi ' + (customerName || 'there') + ',</p>' +
        '<p style="color:#555;font-size:14px;line-height:1.6;">We have received your support request and created ticket <strong>#' + ticketNumber + '</strong>.</p>' +
        '<div style="background:#f9f9f9;padding:16px;margin:20px 0;border-radius:8px;">' +
        '<p style="color:#333;font-size:14px;margin:0;"><strong>Category:</strong> ' + (category || 'General') + '</p>' +
        '<p style="color:#333;font-size:14px;margin:8px 0 0;"><strong>Status:</strong> Open</p>' +
        '</div>' +
        '<p style="color:#555;font-size:14px;line-height:1.6;">Our team will review your ticket and respond as soon as possible. You will receive an email when we reply.</p>' +
        '<a href="https://dash.vantagequant.com/portal/chat.html" style="display:inline-block;background:#3b6dff;color:#06070c;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-top:12px;">View Your Tickets</a>' +
        '</div>' +
        '</div></body></html>';

    return await window.sendResendEmail(customerEmail, subject, html);
};

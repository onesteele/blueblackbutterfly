// ============================================================
// ACTIVITY TRACKER - Include on all portal pages
// Automatically logs page views and provides manual tracking
// ============================================================

(function() {
    let _userId = null;
    let _ip = null;

    // Friendly page name mapping
    const PAGE_NAMES = {
        '/': 'Dashboard',
        '/index.html': 'Dashboard',
        '/portal/content': 'Content Library',
        '/portal/content.html': 'Content Library',
        '/portal/announcements': 'Announcements',
        '/portal/announcements.html': 'Announcements',
        '/portal/chat': 'Messages',
        '/portal/chat.html': 'Messages',
        '/portal/account': 'Account Settings',
        '/portal/account.html': 'Account Settings',
        '/portal/performance': 'Performance',
        '/portal/performance.html': 'Performance',
        '/onboarding': 'Onboarding',
        '/onboarding/': 'Onboarding',
        '/auth': 'Login',
        '/auth/': 'Login',
        '/auth/index.html': 'Login'
    };

    function getPageName(pathname) {
        return PAGE_NAMES[pathname] || pathname;
    }

    // Initialize tracker
    async function init() {
        try {
            const user = await window.getCurrentUser();
            if (user) {
                _userId = user.id;
                // Get IP in background
                window.getUserIP().then(ip => { _ip = ip; });
                // Auto-track page view with descriptive name
                const pageName = getPageName(window.location.pathname);
                trackActivity('page_view', window.location.pathname, {
                    page_name: pageName
                });
            }
        } catch (e) {
            console.error('Activity tracker init error:', e);
        }
    }

    // Track an activity
    async function trackActivity(action, page, details) {
        if (!_userId) return;

        try {
            const enrichedDetails = details || {};
            // Always include page_name if not provided
            if (!enrichedDetails.page_name && page) {
                enrichedDetails.page_name = getPageName(page);
            }

            await window.supabaseClient.from('activity_log').insert({
                user_id: _userId,
                action: action,
                page: page || window.location.pathname,
                details: enrichedDetails,
                ip_address: _ip || 'Unknown',
                user_agent: navigator.userAgent
            });
        } catch (e) {
            console.error('Activity tracking error:', e);
        }
    }

    // Expose globally
    window.trackActivity = trackActivity;
    window.getPageName = getPageName;

    // Initialize when Supabase is ready
    if (window.supabaseClient) {
        init();
    } else {
        window.addEventListener('load', () => setTimeout(init, 500));
    }
})();

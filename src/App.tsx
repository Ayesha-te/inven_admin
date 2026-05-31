import { useEffect, useMemo, useState } from 'react';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface AuthUser {
  id: number | string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
}

interface StaffMember {
  id: number | string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface SubStore {
  id: string;
  name: string;
  is_verified: boolean;
  registration_date: string;
}

interface StoreSummary {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  is_verified: boolean;
  is_sub_store: boolean;
  registration_date: string;
  sub_stores: SubStore[];
  staff_members: StaffMember[];
}

interface ManagedUser {
  id: number | string;
  full_name: string;
  email: string;
  phone?: string;
  company_name?: string;
  subscription_plan: string;
  subscription_status_text: string;
  approval_status: ApprovalStatus;
  approved_at?: string | null;
  approved_by_name?: string | null;
  is_active: boolean;
  is_verified: boolean;
  registration_date: string;
  total_stores: number;
  total_sub_stores: number;
  total_staff_members: number;
  stores: StoreSummary[];
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://clumsy-virgie-aamzaabdul-f5d0773e.koyeb.app'
).replace(/\/+$/, '');
const TOKEN_KEY = 'inventory_adminpanel_access_token';
const USER_KEY = 'inventory_adminpanel_user';

const statusClassMap: Record<ApprovalStatus, string> = {
  PENDING: 'status status-pending',
  APPROVED: 'status status-approved',
  REJECTED: 'status status-rejected',
};

const subscriptionPlanLabelMap: Record<string, string> = {
  FREE: 'Basic',
  STARTER: 'Basic',
  BASIC: 'Basic',
  STANDARD: 'Starter',
  PREMIUM: 'Pro',
  PRO: 'Pro',
  OTHER: 'Pro',
};

const getSubscriptionPlanLabel = (plan?: string | null) => {
  const normalized = String(plan || '').toUpperCase();
  return subscriptionPlanLabelMap[normalized] || String(plan || 'Basic');
};

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || '');
  const [adminUser, setAdminUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as AuthUser : null;
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | number | null>(null);

  const isAuthenticated = Boolean(token && adminUser);

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        typeof data === 'string'
          ? data
          : data?.message || data?.detail || data?.error || JSON.stringify(data);
      throw new Error(message || `Request failed with ${response.status}`);
    }

    return data;
  };

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await apiFetch('/api/accounts/admin/users/');
      const results = Array.isArray(response) ? response : response?.results || [];
      setUsers(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void loadUsers();
    }
  }, [isAuthenticated]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) => {
      const haystack = [
        user.full_name,
        user.email,
        user.company_name,
        user.subscription_plan,
        getSubscriptionPlanLabel(user.subscription_plan),
        ...user.stores.map((store) => store.name),
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }, [search, users]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      pending: users.filter((user) => user.approval_status === 'PENDING').length,
      approved: users.filter((user) => user.approval_status === 'APPROVED').length,
      rejected: users.filter((user) => user.approval_status === 'REJECTED').length,
    };
  }, [users]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/accounts/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : await response.text();
      if (!response.ok) {
        const message =
          typeof data === 'string'
            ? data
            : data?.detail || data?.error || data?.message || JSON.stringify(data);
        throw new Error(message || `Login failed with ${response.status}`);
      }

      if (typeof data === 'string') {
        throw new Error('The server returned an unexpected response format during login.');
      }

      const loggedInUser: AuthUser | undefined = data?.user;
      if (!loggedInUser?.is_staff && !loggedInUser?.is_superuser) {
        throw new Error('This account is not allowed to access the admin panel.');
      }

      const accessToken = data?.tokens?.access;
      if (!accessToken) {
        throw new Error('No access token received from the server.');
      }

      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(loggedInUser));
      setToken(accessToken);
      setAdminUser(loggedInUser);
      setPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Admin login failed.';
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken('');
    setAdminUser(null);
    setUsers([]);
    setSearch('');
  };

  const handleAction = async (userId: string | number, action: 'approve' | 'reject' | 'delete') => {
    try {
      setBusyUserId(userId);

      if (action === 'approve') {
        await apiFetch(`/api/accounts/admin/users/${userId}/approve/`, { method: 'POST' });
      } else if (action === 'reject') {
        await apiFetch(`/api/accounts/admin/users/${userId}/reject/`, { method: 'POST' });
      } else {
        const confirmed = window.confirm('Remove this user and all related records?');
        if (!confirmed) {
          return;
        }
        await apiFetch(`/api/accounts/admin/users/${userId}/`, { method: 'DELETE' });
      }

      await loadUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed.';
      window.alert(message);
    } finally {
      setBusyUserId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="page-shell">
        <div className="login-card">
          <div>
            <p className="eyebrow">Inventory Admin</p>
            <h1>Approval Control Panel</h1>
            <p className="muted">
              Review registration requests, approve users, inspect stores and sub-stores, and remove accounts when required.
            </p>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            {loginError && <div className="error-box">{loginError}</div>}

            <button type="submit" className="primary-button" disabled={isLoggingIn}>
              {isLoggingIn ? 'Signing In...' : 'Open Admin Panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Inventory Admin</p>
          <h2>User Approval</h2>
        </div>
        <div className="sidebar-card">
          <p className="sidebar-name">
            {adminUser?.first_name || adminUser?.last_name
              ? `${adminUser?.first_name || ''} ${adminUser?.last_name || ''}`.trim()
              : adminUser?.email}
          </p>
          <p className="sidebar-role">{adminUser?.is_superuser ? 'Superuser' : 'Admin User'}</p>
        </div>
        <button type="button" className="secondary-button" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Standalone React App</p>
            <h1>Admin Panel</h1>
          </div>
          <div className="topbar-actions">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users or stores..."
            />
            <button type="button" className="secondary-button" onClick={() => void loadUsers()}>
              Refresh
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <StatCard label="Total Users" value={stats.total} />
          <StatCard label="Pending Requests" value={stats.pending} />
          <StatCard label="Approved Users" value={stats.approved} />
          <StatCard label="Rejected Users" value={stats.rejected} />
        </section>

        {error && <div className="error-box">{error}</div>}

        {isLoading ? (
          <div className="empty-state">Loading admin data...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">No users matched your search.</div>
        ) : (
          <section className="user-list">
            {filteredUsers.map((user) => (
              <article key={user.id} className="user-card">
                <div className="user-header">
                  <div>
                    <div className="user-title-row">
                      <h3>{user.full_name}</h3>
                      <span className={statusClassMap[user.approval_status]}>{user.approval_status}</span>
                    </div>
                    <p className="muted">{user.email}</p>
                  </div>
                  <div className="action-row">
                    <button
                      type="button"
                      className="approve-button"
                      disabled={busyUserId === user.id}
                      onClick={() => void handleAction(user.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="reject-button"
                      disabled={busyUserId === user.id}
                      onClick={() => void handleAction(user.id, 'reject')}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      disabled={busyUserId === user.id}
                      onClick={() => void handleAction(user.id, 'delete')}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="detail-grid">
                  <DetailItem label="Company" value={user.company_name || 'Not provided'} />
                  <DetailItem label="Phone" value={user.phone || 'Not provided'} />
                  <DetailItem label="Plan" value={getSubscriptionPlanLabel(user.subscription_plan)} />
                  <DetailItem label="Subscription Status" value={user.subscription_status_text} />
                  <DetailItem label="Registered" value={new Date(user.registration_date).toLocaleDateString()} />
                  <DetailItem label="Approved By" value={user.approved_by_name || 'Not approved yet'} />
                </div>

                <div className="metrics-grid">
                  <MiniMetric label="Stores" value={user.total_stores} />
                  <MiniMetric label="Sub Stores" value={user.total_sub_stores} />
                  <MiniMetric label="Sub Users / Staff" value={user.total_staff_members} />
                </div>

                <div className="stores-section">
                  <h4>Stores and Sub-Stores</h4>
                  {user.stores.length === 0 ? (
                    <p className="muted">No stores available for this user.</p>
                  ) : (
                    <div className="stores-grid">
                      {user.stores.map((store) => (
                        <div key={store.id} className="store-card">
                          <div className="store-heading">
                            <strong>{store.name}</strong>
                            <span className={store.is_verified ? 'verified-pill' : 'pending-pill'}>
                              {store.is_verified ? 'Verified' : 'Pending'}
                            </span>
                          </div>
                          <p className="muted">{store.address}</p>

                          <div className="store-block">
                            <span className="block-label">Sub Stores</span>
                            <div className="pill-row">
                              {store.sub_stores.length > 0 ? (
                                store.sub_stores.map((subStore) => (
                                  <span key={subStore.id} className="info-pill">
                                    {subStore.name}
                                  </span>
                                ))
                              ) : (
                                <span className="muted">None</span>
                              )}
                            </div>
                          </div>

                          <div className="store-block">
                            <span className="block-label">Sub Users / Staff</span>
                            <div className="staff-list">
                              {store.staff_members.length > 0 ? (
                                store.staff_members.map((staff) => (
                                  <div key={`${store.id}-${staff.id}`} className="staff-item">
                                    <strong>{staff.name}</strong>
                                    <span>{staff.email} - {staff.role}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="muted">No staff assigned</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;

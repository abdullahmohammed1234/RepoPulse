'use client';

import { useState, useEffect } from 'react';
import {
  getUserTeams,
  createTeam,
  getTeam,
  getTeamMembers,
  getTeamWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getCurrentUser,
  logoutUser,
  registerUser,
  loginUser,
  Team,
  TeamMember,
  WatchlistItem,
  Notification,
  TeamUser,
} from '@/lib/api';

export default function TeamPage() {
  const [user, setUser] = useState<TeamUser | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'teams' | 'notifications'>('teams');
  const [loading, setLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoId, setNewRepoId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to get current user
      try {
        const userResult = await getCurrentUser();
        setUser(userResult.user);
      } catch {
        // Not logged in - show login/register options
        setUser(null);
      }

      // Load teams (will fail if not authenticated)
      try {
        const teamsResult = await getUserTeams();
        setTeams(teamsResult.teams);
      } catch {
        // Not authenticated yet
        setTeams([]);
      }

      // Load notifications (will fail if not authenticated)
      try {
        const notifResult = await getNotifications({ limit: 20 });
        setNotifications(notifResult.notifications);
        setUnreadCount(notifResult.unread_count);
      } catch {
        // Ignore if not authenticated
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadTeamDetails = async (teamId: number) => {
    try {
      const result = await getTeam(teamId);
      setSelectedTeam(result.team);
      setMembers(result.members);
      setWatchlist(result.watchlist);
    } catch (err) {
      console.error('Failed to load team:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const result = await registerUser({
        email: registerEmail,
        username: registerUsername,
      });
      setUser(result.user);
      setShowLogin(false);
      setShowCreateTeam(true);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const result = await loginUser(loginEmail);
      setUser(result.user);
      setShowLogin(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createTeam({
        name: newTeamName,
        description: newTeamDescription,
      });
      setTeams([...teams, result.team]);
      setShowCreateTeam(false);
      setNewTeamName('');
      setNewTeamDescription('');
      setSelectedTeam(result.team);
      loadTeamDetails(result.team.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  };

  const handleAddToWatchlist = async (repositoryId: number) => {
    if (!selectedTeam) return;
    try {
      await addToWatchlist(selectedTeam.id, repositoryId);
      loadTeamDetails(selectedTeam.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
    }
  };

  const handleRemoveFromWatchlist = async (repositoryId: number) => {
    if (!selectedTeam) return;
    try {
      await removeFromWatchlist(selectedTeam.id, repositoryId);
      loadTeamDetails(selectedTeam.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from watchlist');
    }
  };

  const handleAddToWatchlistById = async () => {
    if (!selectedTeam || !newRepoId) return;
    try {
      await addToWatchlist(selectedTeam.id, parseInt(newRepoId));
      setNewRepoId('');
      setShowAddRepo(false);
      loadTeamDetails(selectedTeam.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
    }
  };

  const handleMarkNotificationRead = async (notificationId: number) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications(
        notifications.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setTeams([]);
    setSelectedTeam(null);
    setNotifications([]);
    loadData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login/register if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-foreground mb-2">👥 Team Collaboration</h1>
              <p className="text-muted-foreground text-lg">
                Sign in to create teams, share watchlists, and collaborate on PR analysis
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* Login Form */}
            <div className="bg-card border border-border rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Sign In</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Sign In
                </button>
              </form>
            </div>

            {/* Register Form */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Create Account</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Create Account
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary/20 to-purple-500/20 border-b border-border">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-4xl font-bold text-foreground">👥 Team Collaboration</h1>
              <span className="text-muted-foreground">
                Welcome, {user.display_name || user.username}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setActiveTab('notifications')}
                className={`relative p-2 rounded-lg transition-colors ${
                  activeTab === 'notifications'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('teams')}
                className={`p-2 rounded-lg transition-colors ${
                  activeTab === 'teams'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="bg-card border border-border rounded-xl">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Notifications</h2>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-sm text-primary hover:text-primary/80"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                      !notification.is_read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() =>
                      !notification.is_read &&
                      handleMarkNotificationRead(notification.id)
                    }
                  >
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <span
                          className={`inline-flex items-center justify-center h-10 w-10 rounded-full ${
                            notification.type === 'high_risk_pr'
                              ? 'bg-red-500/20 text-red-400'
                              : notification.type === 'mention'
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {notification.type === 'high_risk_pr' ? '⚠️' : '@'}
                        </span>
                      </div>
                      <div className="ml-4 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {notification.title}
                        </p>
                        {notification.message && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-2">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <div className="ml-2 flex-shrink-0">
                          <span className="h-2 w-2 rounded-full bg-primary"></span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Teams List */}
            <div className="lg:col-span-1">
              <div className="bg-card border border-border rounded-xl">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-foreground">Your Teams</h2>
                  <button
                    onClick={() => setShowCreateTeam(true)}
                    className="text-sm text-primary hover:text-primary/80"
                  >
                    + New Team
                  </button>
                </div>
                <div className="divide-y divide-border">
                  {teams.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      No teams yet
                    </div>
                  ) : (
                    teams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => loadTeamDetails(team.id)}
                        className={`w-full px-6 py-4 text-left hover:bg-muted/50 transition-colors ${
                          selectedTeam?.id === team.id ? 'bg-primary/10' : ''
                        }`}
                      >
                        <p className="text-sm font-medium text-foreground">
                          {team.name}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {team.member_role}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Team Details */}
            <div className="lg:col-span-2">
              {selectedTeam ? (
                <div className="space-y-6">
                  {/* Team Info */}
                  <div className="bg-card border border-border rounded-xl">
                    <div className="px-6 py-4 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-foreground">
                            {selectedTeam.name}
                          </h2>
                          {selectedTeam.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {selectedTeam.description}
                            </p>
                          )}
                        </div>
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-primary/20 text-primary capitalize">
                          {selectedTeam.member_role}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Members */}
                  <div className="bg-card border border-border rounded-xl">
                    <div className="px-6 py-4 border-b border-border">
                      <h3 className="text-lg font-semibold text-foreground">
                        Team Members
                      </h3>
                    </div>
                    <div className="divide-y divide-border">
                      {members.map((member) => (
                        <div
                          key={member.id}
                          className="px-6 py-4 flex items-center"
                        >
                          <div className="flex-shrink-0">
                            {member.avatar_url ? (
                              <img
                                className="h-10 w-10 rounded-full"
                                src={member.avatar_url}
                                alt=""
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-muted-foreground">
                                  {member.username[0].toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4 flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {member.display_name || member.username}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground capitalize">
                            {member.team_role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Watchlist */}
                  <div className="bg-card border border-border rounded-xl">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground">
                        Repository Watchlist
                      </h3>
                      <button
                        onClick={() => setShowAddRepo(true)}
                        className="text-sm text-primary hover:text-primary/80"
                      >
                        + Add Repository
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {watchlist.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                          No repositories in watchlist
                        </div>
                      ) : (
                        watchlist.map((item) => (
                          <div
                            key={item.id}
                            className="px-6 py-4 flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <div className="flex-shrink-0">
                                <svg
                                  className="h-6 w-6 text-muted-foreground"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                  />
                                </svg>
                              </div>
                              <div className="ml-4">
                                <p className="text-sm font-medium text-foreground">
                                  {item.full_name}
                                </p>
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                  {item.language && (
                                    <span className="px-2 py-0.5 rounded-full bg-muted">
                                      {item.language}
                                    </span>
                                  )}
                                  <span>⭐ {item.stars}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                handleRemoveFromWatchlist(item.repository_id)
                              }
                              className="text-sm text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-foreground">
                    Select a Team
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose a team from the list to view its details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Team Modal */}
        {showCreateTeam && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full mx-4">
              <form onSubmit={handleCreateTeam}>
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground">
                    Create New Team
                  </h3>
                </div>
                <div className="px-6 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Team Name
                    </label>
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Description (optional)
                    </label>
                    <textarea
                      value={newTeamDescription}
                      onChange={(e) => setNewTeamDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="px-6 py-4 bg-muted/50 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateTeam(false)}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
                  >
                    Create Team
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Repository Modal */}
        {showAddRepo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">
                  Add Repository to Watchlist
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Repository ID
                  </label>
                  <input
                    type="number"
                    value={newRepoId}
                    onChange={(e) => setNewRepoId(e.target.value)}
                    placeholder="Enter repository ID (e.g., 1)"
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Find the repository ID from the repository list on the dashboard
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-muted/50 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => { setShowAddRepo(false); setNewRepoId(''); }}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToWatchlistById}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
                >
                  Add to Watchlist
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

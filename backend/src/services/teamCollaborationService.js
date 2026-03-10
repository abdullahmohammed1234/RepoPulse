/**
 * Team Collaboration Service
 * Handles user authentication, team workspaces, watchlists, comments, and notifications
 */

const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../config/db');
const realtimeService = require('./realtimeService');

// ============ USER FUNCTIONS ============

/**
 * Create a new user
 */
async function createUser(userData) {
  const { email, username, display_name, avatar_url, github_id, github_access_token } = userData;
  
  // Use existing id column (which is UUID)
  const userId = uuidv4();
  
  const result = await query(
    `INSERT INTO users (id, email, login, username, display_name, avatar_url, github_id, github_access_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, email, username || email.split('@')[0], username, display_name || username, avatar_url, github_id, github_access_token]
  );
  
  return result.rows[0];
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0];
}

/**
 * Get user by GitHub ID
 */
async function getUserByGitHubId(githubId) {
  const result = await query('SELECT * FROM users WHERE github_id = $1', [githubId]);
  return result.rows[0];
}

/**
 * Update user
 */
async function updateUser(userId, updates) {
  const { display_name, avatar_url, preferences, role } = updates;
  
  const result = await query(
    `UPDATE users 
     SET display_name = COALESCE($1, display_name),
         avatar_url = COALESCE($2, avatar_url),
         preferences = COALESCE($3, preferences),
         role = COALESCE($4, role),
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [display_name, avatar_url, preferences, role, userId]
  );
  
  return result.rows[0];
}

/**
 * Update user login timestamp
 */
async function updateUserLogin(userId) {
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [userId]
  );
}

// ============ TEAM FUNCTIONS ============

/**
 * Create a new team
 */
async function createTeam(teamData, ownerId) {
  const { name, description, avatar_url, settings } = teamData;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  // Check if slug exists
  const existing = await query('SELECT id FROM teams WHERE slug = $1', [slug]);
  if (existing.rows.length > 0) {
    throw new Error('Team slug already exists');
  }
  
  const result = await query(
    `INSERT INTO teams (uuid, name, slug, description, avatar_url, owner_id, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuidv4(), name, slug, description, avatar_url, ownerId, JSON.stringify(settings || {})]
  );
  
  const team = result.rows[0];
  
  // Add owner as admin member
  await query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [team.id, ownerId]
  );
  
  return team;
}

/**
 * Get team by ID
 */
async function getTeamById(teamId) {
  const result = await query('SELECT * FROM teams WHERE id = $1', [teamId]);
  return result.rows[0];
}

/**
 * Get team by UUID
 */
async function getTeamByUuid(teamUuid) {
  const result = await query('SELECT * FROM teams WHERE uuid = $1', [teamUuid]);
  return result.rows[0];
}

/**
 * Get team by slug
 */
async function getTeamBySlug(slug) {
  const result = await query('SELECT * FROM teams WHERE slug = $1', [slug]);
  return result.rows[0];
}

/**
 * Get teams for a user
 */
async function getUserTeams(userId) {
  const result = await query(
    `SELECT t.*, tm.role as member_role
     FROM teams t
     JOIN team_members tm ON t.id = tm.team_id
     WHERE tm.user_id = $1 AND t.is_active = true
     ORDER BY t.name`,
    [userId]
  );
  return result.rows;
}

/**
 * Update team
 */
async function updateTeam(teamId, updates) {
  const { name, description, avatar_url, settings, notification_preferences } = updates;
  
  const result = await query(
    `UPDATE teams 
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         avatar_url = COALESCE($3, avatar_url),
         settings = COALESCE($4, settings),
         notification_preferences = COALESCE($5, notification_preferences),
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [name, description, avatar_url, settings, notification_preferences, teamId]
  );
  
  return result.rows[0];
}

/**
 * Get team members
 */
async function getTeamMembers(teamId) {
  const result = await query(
    `SELECT u.id, u.email, u.login, u.username, u.display_name, u.avatar_url, u.role as user_role, tm.role as team_role, tm.joined_at
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.team_id = $1
     ORDER BY tm.role DESC, COALESCE(u.username, u.login)`,
    [teamId]
  );
  return result.rows;
}

/**
 * Add member to team
 */
async function addTeamMember(teamId, userId, role = 'member') {
  const result = await query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [teamId, userId, role]
  );
  return result.rows[0];
}

/**
 * Remove member from team
 */
async function removeTeamMember(teamId, userId) {
  await query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
}

/**
 * Check if user is team member
 */
async function isTeamMember(teamId, userId) {
  const result = await query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Check if user is team admin
 */
async function isTeamAdmin(teamId, userId) {
  const result = await query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = $3',
    [teamId, userId, 'admin']
  );
  return result.rows.length > 0;
}

// ============ INVITATION FUNCTIONS ============

/**
 * Create team invitation
 */
async function createTeamInvitation(teamId, email, invitedBy, role = 'member') {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  const result = await query(
    `INSERT INTO team_invitations (team_id, email, invited_by, token, role, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [teamId, email, invitedBy, token, role, expiresAt]
  );
  
  return result.rows[0];
}

/**
 * Get invitation by token
 */
async function getInvitationByToken(token) {
  const result = await query(
    `SELECT ti.*, t.name as team_name, t.slug as team_slug
     FROM team_invitations ti
     JOIN teams t ON ti.team_id = t.id
     WHERE ti.token = $1 AND ti.status = 'pending' AND ti.expires_at > NOW()`,
    [token]
  );
  return result.rows[0];
}

/**
 * Accept invitation
 */
async function acceptInvitation(token, userId) {
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    throw new Error('Invalid or expired invitation');
  }
  
  // Add user to team
  await addTeamMember(invitation.team_id, userId, invitation.role);
  
  // Update invitation status
  await query(
    'UPDATE team_invitations SET status = $1 WHERE token = $2',
    ['accepted', token]
  );
  
  return { success: true, team_id: invitation.team_id };
}

// ============ WATCHLIST FUNCTIONS ============

/**
 * Add repository to team watchlist
 */
async function addToWatchlist(teamId, repositoryId, addedBy, watchSettings = {}) {
  const result = await query(
    `INSERT INTO team_watchlists (team_id, repository_id, added_by, watch_settings)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_id, repository_id) DO UPDATE SET is_active = true, watch_settings = $4
     RETURNING *`,
    [teamId, repositoryId, addedBy, JSON.stringify(watchSettings)]
  );
  
  return result.rows[0];
}

/**
 * Remove repository from team watchlist
 */
async function removeFromWatchlist(teamId, repositoryId) {
  await query(
    'UPDATE team_watchlists SET is_active = false WHERE team_id = $1 AND repository_id = $2',
    [teamId, repositoryId]
  );
}

/**
 * Get team watchlist
 */
async function getTeamWatchlist(teamId) {
  const result = await query(
    `SELECT tw.*, r.name, r.full_name, r.owner, r.url, r.language, r.stars
     FROM team_watchlists tw
     JOIN repositories r ON tw.repository_id = r.id
     WHERE tw.team_id = $1 AND tw.is_active = true
     ORDER BY tw.created_at DESC`,
    [teamId]
  );
  return result.rows;
}

/**
 * Update watchlist settings
 */
async function updateWatchlistSettings(teamId, repositoryId, watchSettings) {
  const result = await query(
    `UPDATE team_watchlists 
     SET watch_settings = $1, updated_at = NOW()
     WHERE team_id = $2 AND repository_id = $3
     RETURNING *`,
    [JSON.stringify(watchSettings), teamId, repositoryId]
  );
  return result.rows[0];
}

// ============ NOTIFICATION FUNCTIONS ============

/**
 * Create notification
 */
async function createNotification(notificationData) {
  const { user_id, team_id, type, title, message, data, link } = notificationData;
  
  const result = await query(
    `INSERT INTO notifications (uuid, user_id, team_id, type, title, message, data, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [uuidv4(), user_id, team_id, type, title, message, JSON.stringify(data || {}), link]
  );
  
  const notification = result.rows[0];
  
  // Send real-time notification
  if (user_id) {
    realtimeService.sendNotification(
      title,
      message,
      type
    );
  }
  
  return notification;
}

/**
 * Get user notifications
 */
async function getUserNotifications(userId, options = {}) {
  const { limit = 20, offset = 0, unread_only = false } = options;
  
  let whereClause = 'WHERE user_id = $1';
  const params = [userId];
  
  if (unread_only) {
    whereClause += ' AND is_read = false';
  }
  
  const result = await query(
    `SELECT * FROM notifications 
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  
  return result.rows;
}

/**
 * Mark notification as read
 */
async function markNotificationRead(notificationId, userId) {
  await query(
    'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsRead(userId) {
  await query(
    'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
    [userId]
  );
}

/**
 * Get unread notification count
 */
async function getUnreadNotificationCount(userId) {
  const result = await query(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return parseInt(result.rows[0].count);
}

// ============ COMMENT FUNCTIONS ============

/**
 * Create comment on PR analysis
 */
async function createComment(commentData) {
  const { pull_request_id, team_id, parent_id, author_id, content, is_internal } = commentData;
  
  const result = await query(
    `INSERT INTO pr_comments (uuid, pull_request_id, team_id, parent_id, author_id, content, is_internal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuidv4(), pull_request_id, team_id, parent_id, author_id, content, is_internal || false]
  );
  
  const comment = result.rows[0];
  
  // Extract and create mentions
  const mentionRegex = /@(\w+)/g;
  let match;
  const mentionedUsernames = [];
  
  while ((match = mentionRegex.exec(content)) !== null) {
    mentionedUsernames.push(match[1]);
  }
  
  if (mentionedUsernames.length > 0) {
    // Get users by usernames
    const usersResult = await query(
      `SELECT id FROM users WHERE username = ANY($1)`,
      [mentionedUsernames]
    );
    
    for (const user of usersResult.rows) {
      await query(
        `INSERT INTO comment_mentions (comment_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [comment.id, user.id]
      );
      
      // Create notification for mentioned user
      const teamMembers = await getTeamMembers(team_id);
      const authorResult = await getUserById(author_id);
      
      await createNotification({
        user_id: user.id,
        team_id,
        type: 'mention',
        title: 'You were mentioned in a comment',
        message: `${authorResult?.username || 'Someone'} mentioned you in a PR comment`,
        data: { comment_id: comment.id, pull_request_id },
        link: `/repository/${team_id}/pull-requests/${pull_request_id}`
      });
    }
  }
  
  return comment;
}

/**
 * Get comments for PR
 */
async function getPRComments(pullRequestId, options = {}) {
  const { include_internal = false, team_id } = options;
  
  let whereClause = 'WHERE pull_request_id = $1';
  const params = [pullRequestId];
  
  if (!include_internal && team_id) {
    whereClause += ' AND (is_internal = false OR team_id = $2)';
    params.push(team_id);
  }
  
  const result = await query(
    `SELECT c.*, u.username as author_username, u.display_name as author_display_name, u.avatar_url as author_avatar,
            r.login as resolved_by_username
     FROM pr_comments c
     LEFT JOIN users u ON c.author_id = u.id
     LEFT JOIN users r ON c.resolved_by = r.id
     ${whereClause}
     ORDER BY c.created_at ASC`,
    params
  );
  
  // Build comment tree
  const commentMap = new Map();
  const rootComments = [];
  
  for (const comment of result.rows) {
    comment.children = [];
    commentMap.set(comment.id, comment);
  }
  
  for (const comment of result.rows) {
    if (comment.parent_id) {
      const parent = commentMap.get(comment.parent_id);
      if (parent) {
        parent.children.push(comment);
      }
    } else {
      rootComments.push(comment);
    }
  }
  
  return rootComments;
}

/**
 * Update comment
 */
async function updateComment(commentId, authorId, content) {
  const result = await query(
    `UPDATE pr_comments 
     SET content = $1, updated_at = NOW()
     WHERE id = $2 AND author_id = $3
     RETURNING *`,
    [content, commentId, authorId]
  );
  return result.rows[0];
}

/**
 * Delete comment
 */
async function deleteComment(commentId, authorId) {
  // Only author can delete
  await query(
    'DELETE FROM pr_comments WHERE id = $1 AND author_id = $2',
    [commentId, authorId]
  );
}

/**
 * Resolve comment
 */
async function resolveComment(commentId, resolvedBy) {
  const result = await query(
    `UPDATE pr_comments 
     SET is_resolved = true, resolved_by = $1, resolved_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [resolvedBy, commentId]
  );
  return result.rows[0];
}

/**
 * Unresolve comment
 */
async function unresolveComment(commentId) {
  const result = await query(
    `UPDATE pr_comments 
     SET is_resolved = false, resolved_by = NULL, resolved_at = NULL
     WHERE id = $1
     RETURNING *`,
    [commentId]
  );
  return result.rows[0];
}

// ============ HIGH RISK WATCH FUNCTIONS ============

/**
 * Create high risk watch
 */
async function createHighRiskWatch(teamId, repositoryId, riskThreshold = 0.7, notifyTeamMembers = true) {
  const result = await query(
    `INSERT INTO high_risk_watches (team_id, repository_id, risk_threshold, notify_team_members)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_id, repository_id) DO UPDATE SET risk_threshold = $3, notify_team_members = $4
     RETURNING *`,
    [teamId, repositoryId, riskThreshold, notifyTeamMembers]
  );
  return result.rows[0];
}

/**
 * Get high risk watches for team
 */
async function getHighRiskWatches(teamId) {
  const result = await query(
    `SELECT hrw.*, r.name as repository_name, r.full_name as repository_full_name
     FROM high_risk_watches hrw
     JOIN repositories r ON hrw.repository_id = r.id
     WHERE hrw.team_id = $1
     ORDER BY hrw.created_at DESC`,
    [teamId]
  );
  return result.rows;
}

/**
 * Check and notify high risk PRs
 */
async function checkHighRiskPRs(teamId) {
  const watches = await getHighRiskWatches(teamId);
  const team = await getTeamById(teamId);
  
  for (const watch of watches) {
    // Get high risk PRs
    const result = await query(
      `SELECT pr.*, r.name as repo_name
       FROM pull_requests pr
       JOIN repositories r ON pr.repository_id = r.id
       WHERE pr.repository_id = $1 AND pr.risk_score >= $2 AND pr.state = 'open'`,
      [watch.repository_id, watch.risk_threshold]
    );
    
    // Check if we should notify (rate limit - only notify once per hour)
    const lastNotified = watch.last_notified_at;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    if (!lastNotified || new Date(lastNotified) < oneHourAgo) {
      if (result.rows.length > 0) {
        // Notify team members
        const teamMembers = await getTeamMembers(teamId);
        
        for (const member of teamMembers) {
          await createNotification({
            user_id: member.id,
            team_id: teamId,
            type: 'high_risk_pr',
            title: `High Risk PRs Detected in ${watch.repository_name}`,
            message: `${result.rows.length} PR(s) with risk score >= ${watch.risk_threshold} detected`,
            data: { 
              repository_id: watch.repository_id, 
              pr_count: result.rows.length,
              risk_threshold: watch.risk_threshold
            },
            link: `/repository/${watch.repository_id}/pull-requests?minRisk=${watch.risk_threshold}`
          });
        }
        
        // Update last notified timestamp
        await query(
          'UPDATE high_risk_watches SET last_notified_at = NOW() WHERE id = $1',
          [watch.id]
        );
      }
    }
  }
}

// ============ SESSION FUNCTIONS ============

/**
 * Create session
 */
async function createSession(userId, sessionData = {}) {
  const { ip_address, user_agent } = sessionData;
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  const result = await query(
    `INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, token, expiresAt, ip_address, user_agent]
  );
  
  return result.rows[0];
}

/**
 * Validate session
 */
async function validateSession(token) {
  const result = await query(
    `SELECT us.*, u.email, u.login, u.username, u.display_name, u.avatar_url, u.role
     FROM user_sessions us
     JOIN users u ON us.user_id = u.id
     WHERE us.session_token = $1 AND us.is_active = true AND us.expires_at > NOW()`,
    [token]
  );
  
  if (result.rows.length > 0) {
    // Update last used
    await query(
      'UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1',
      [result.rows[0].id]
    );
  }
  
  return result.rows[0];
}

/**
 * Invalidate session
 */
async function invalidateSession(token) {
  await query(
    'UPDATE user_sessions SET is_active = false WHERE session_token = $1',
    [token]
  );
}

/**
 * Invalidate all user sessions
 */
async function invalidateAllUserSessions(userId) {
  await query(
    'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
    [userId]
  );
}

module.exports = {
  // User functions
  createUser,
  getUserById,
  getUserByEmail,
  getUserByGitHubId,
  updateUser,
  updateUserLogin,
  
  // Team functions
  createTeam,
  getTeamById,
  getTeamByUuid,
  getTeamBySlug,
  getUserTeams,
  updateTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  isTeamMember,
  isTeamAdmin,
  
  // Invitation functions
  createTeamInvitation,
  getInvitationByToken,
  acceptInvitation,
  
  // Watchlist functions
  addToWatchlist,
  removeFromWatchlist,
  getTeamWatchlist,
  updateWatchlistSettings,
  
  // Notification functions
  createNotification,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  
  // Comment functions
  createComment,
  getPRComments,
  updateComment,
  deleteComment,
  resolveComment,
  unresolveComment,
  
  // High risk watch functions
  createHighRiskWatch,
  getHighRiskWatches,
  checkHighRiskPRs,
  
  // Session functions
  createSession,
  validateSession,
  invalidateSession,
  invalidateAllUserSessions,
};

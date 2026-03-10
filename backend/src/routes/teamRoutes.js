/**
 * Team Collaboration Routes
 * Handles user authentication, team workspaces, watchlists, comments, and notifications
 */

const express = require('express');
const router = express.Router();
const teamService = require('../services/teamCollaborationService');
const { query } = require('../config/db');

// ============ AUTHENTICATION MIDDLEWARE (Mock - would use JWT in production) ============

// Get user from session token header
async function getAuthenticatedUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const session = await teamService.validateSession(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = {
      id: session.user_id,
      uuid: session.id,
      email: session.email,
      username: session.username,
      display_name: session.display_name,
      avatar_url: session.avatar_url,
      role: session.role
    };
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// ============ USER ROUTES ============

// POST /api/team/auth/register - Register new user
router.post('/auth/register', async (req, res) => {
  try {
    const { email, username, display_name, avatar_url, password } = req.body;
    
    if (!email || !username) {
      return res.status(400).json({ error: 'Email and username are required' });
    }
    
    // Check if user exists
    const existing = await teamService.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create user (password would be hashed in production)
    const user = await teamService.createUser({
      email,
      username,
      display_name,
      avatar_url
    });
    
    // Create session
    const session = await teamService.createSession(user.id, {
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    res.status(201).json({
      user: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role: user.role
      },
      token: session.session_token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/auth/login - Login user
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await teamService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update login timestamp
    await teamService.updateUserLogin(user.id);
    
    // Create session
    const session = await teamService.createSession(user.id, {
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    res.json({
      user: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role: user.role
      },
      token: session.session_token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/auth/github - Login/Register with GitHub
router.post('/auth/github', async (req, res) => {
  try {
    const { github_id, github_access_token, email, username, avatar_url } = req.body;
    
    if (!github_id) {
      return res.status(400).json({ error: 'GitHub ID is required' });
    }
    
    // Check if user exists
    let user = await teamService.getUserByGitHubId(github_id);
    
    if (!user) {
      // Create new user
      user = await teamService.createUser({
        email: email || `${github_id}@github`,
        username: username || `user_${github_id}`,
        display_name: username,
        avatar_url,
        github_id,
        github_access_token
      });
    } else {
      // Update access token
      await teamService.updateUser(user.id, { github_access_token });
    }
    
    // Create session
    const session = await teamService.createSession(user.id, {
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    res.json({
      user: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role: user.role
      },
      token: session.session_token
    });
  } catch (error) {
    console.error('GitHub auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/auth/logout - Logout user
router.post('/auth/logout', getAuthenticatedUser, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    await teamService.invalidateSession(token);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/team/auth/me - Get current user
router.get('/auth/me', getAuthenticatedUser, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ TEAM ROUTES ============

// GET /api/team/teams - Get user's teams
router.get('/teams', getAuthenticatedUser, async (req, res) => {
  try {
    const teams = await teamService.getUserTeams(req.user.id);
    res.json({ teams });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/teams - Create new team
router.post('/teams', getAuthenticatedUser, async (req, res) => {
  try {
    const { name, description, avatar_url, settings } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    
    const team = await teamService.createTeam({
      name,
      description,
      avatar_url,
      settings
    }, req.user.id);
    
    res.status(201).json({ team });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/team/teams/:id - Get team details
router.get('/teams/:id', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    // Check membership
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    const team = await teamService.getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const members = await teamService.getTeamMembers(teamId);
    const watchlist = await teamService.getTeamWatchlist(teamId);
    const highRiskWatches = await teamService.getHighRiskWatches(teamId);
    
    res.json({
      team,
      members,
      watchlist,
      highRiskWatches
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/teams/:id - Update team
router.put('/teams/:id', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    // Check admin
    const isAdmin = await teamService.isTeamAdmin(teamId, req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update team' });
    }
    
    const team = await teamService.updateTeam(teamId, req.body);
    res.json({ team });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/team/teams/:id/members - Get team members
router.get('/teams/:id/members', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    const members = await teamService.getTeamMembers(teamId);
    res.json({ members });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/teams/:id/members - Add team member
router.post('/teams/:id/members', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { user_id, email, role } = req.body;
    
    const isAdmin = await teamService.isTeamAdmin(teamId, req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can add members' });
    }
    
    let userId = user_id;
    
    // If email provided, look up user
    if (email && !userId) {
      const user = await teamService.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      userId = user.id;
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'user_id or email required' });
    }
    
    const member = await teamService.addTeamMember(teamId, userId, role || 'member');
    res.status(201).json({ member });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/team/teams/:id/members/:userId - Remove team member
router.delete('/teams/:id/members/:userId', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const memberUserId = req.params.userId;
    
    const isAdmin = await teamService.isTeamAdmin(teamId, req.user.id);
    const isSelf = memberUserId === req.user.id;
    
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Cannot remove this member' });
    }
    
    await teamService.removeTeamMember(teamId, memberUserId);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/teams/:id/invitations - Invite user to team
router.post('/teams/:id/invitations', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { email, role } = req.body;
    
    const isAdmin = await teamService.isTeamAdmin(teamId, req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const invitation = await teamService.createTeamInvitation(teamId, email, req.user.id, role || 'member');
    
    // In production, send email with invitation link
    // For now, return the token
    res.status(201).json({ 
      invitation: {
        ...invitation,
        invitation_link: `/team/invite/${invitation.token}`
      }
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/invitations/:token/accept - Accept invitation
router.post('/invitations/:token/accept', getAuthenticatedUser, async (req, res) => {
  try {
    const token = req.params.token;
    
    const result = await teamService.acceptInvitation(token, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ WATCHLIST ROUTES ============

// GET /api/team/teams/:id/watchlist - Get team watchlist
router.get('/teams/:id/watchlist', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    const watchlist = await teamService.getTeamWatchlist(teamId);
    res.json({ watchlist });
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/teams/:id/watchlist - Add to watchlist
router.post('/teams/:id/watchlist', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { repository_id, watch_settings } = req.body;
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    if (!repository_id) {
      return res.status(400).json({ error: 'repository_id is required' });
    }
    
    // Verify repository exists before adding to watchlist
    const repoResult = await query('SELECT id FROM repositories WHERE id = $1', [repository_id]);
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    const watchlistItem = await teamService.addToWatchlist(teamId, repository_id, req.user.id, watch_settings);
    res.status(201).json({ watchlist: watchlistItem });
  } catch (error) {
    console.error('Add to watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/team/teams/:id/watchlist/:repositoryId - Remove from watchlist
router.delete('/teams/:id/watchlist/:repositoryId', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const repositoryId = parseInt(req.params.repositoryId);
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    // Verify repository exists before removing from watchlist
    const repoResult = await query('SELECT id FROM repositories WHERE id = $1', [repositoryId]);
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    await teamService.removeFromWatchlist(teamId, repositoryId);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/teams/:id/watchlist/:repositoryId - Update watchlist settings
router.put('/teams/:id/watchlist/:repositoryId', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const repositoryId = parseInt(req.params.repositoryId);
    const { watch_settings } = req.body;
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    const watchlistItem = await teamService.updateWatchlistSettings(teamId, repositoryId, watch_settings);
    res.json({ watchlist: watchlistItem });
  } catch (error) {
    console.error('Update watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ NOTIFICATION ROUTES ============

// GET /api/team/notifications - Get user notifications
router.get('/notifications', getAuthenticatedUser, async (req, res) => {
  try {
    const { limit, offset, unread_only } = req.query;
    
    const notifications = await teamService.getUserNotifications(req.user.id, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
      unread_only: unread_only === 'true'
    });
    
    const unreadCount = await teamService.getUnreadNotificationCount(req.user.id);
    
    res.json({ 
      notifications,
      unread_count: unreadCount
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/notifications/:id/read - Mark notification as read
router.put('/notifications/:id/read', getAuthenticatedUser, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    await teamService.markNotificationRead(notificationId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/notifications/read-all - Mark all notifications as read
router.put('/notifications/read-all', getAuthenticatedUser, async (req, res) => {
  try {
    await teamService.markAllNotificationsRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMENT ROUTES ============

// GET /api/team/pull-requests/:id/comments - Get PR comments
router.get('/pull-requests/:id/comments', getAuthenticatedUser, async (req, res) => {
  try {
    const pullRequestId = parseInt(req.params.id);
    const { include_internal } = req.query;
    
    // Get PR to find team_id
    const prResult = await query(
      'SELECT team_id FROM pull_requests WHERE id = $1',
      [pullRequestId]
    );
    
    let teamId = null;
    if (prResult.rows.length > 0) {
      // Get team from repository
      const repoResult = await query(
        'SELECT id FROM repositories WHERE id = (SELECT repository_id FROM pull_requests WHERE id = $1)',
        [pullRequestId]
      );
      
      // Get team watchlist to find if any team watches this repo
      const watchesResult = await query(
        `SELECT team_id FROM team_watchlists tw
         JOIN team_members tm ON tw.team_id = tm.team_id
         WHERE tw.repository_id = $1 AND tm.user_id = $2 AND tw.is_active = true`,
        [repoResult.rows[0]?.id, req.user.id]
      );
      
      if (watchesResult.rows.length > 0) {
        teamId = watchesResult.rows[0].team_id;
      }
    }
    
    const comments = await teamService.getPRComments(pullRequestId, {
      include_internal: include_internal === 'true',
      team_id: teamId
    });
    
    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/pull-requests/:id/comments - Create comment
router.post('/pull-requests/:id/comments', getAuthenticatedUser, async (req, res) => {
  try {
    const pullRequestId = parseInt(req.params.id);
    const { team_id, parent_id, content, is_internal } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    // Check team membership if internal
    if (is_internal && team_id) {
      const isMember = await teamService.isTeamMember(team_id, req.user.id);
      if (!isMember) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }
    }
    
    const comment = await teamService.createComment({
      pull_request_id: pullRequestId,
      team_id,
      parent_id,
      author_id: req.user.id,
      content,
      is_internal
    });
    
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/comments/:id - Update comment
router.put('/comments/:id', getAuthenticatedUser, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const comment = await teamService.updateComment(commentId, req.user.id, content);
    res.json({ comment });
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/team/comments/:id - Delete comment
router.delete('/comments/:id', getAuthenticatedUser, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    await teamService.deleteComment(commentId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/comments/:id/resolve - Resolve comment
router.put('/comments/:id/resolve', getAuthenticatedUser, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const comment = await teamService.resolveComment(commentId, req.user.id);
    res.json({ comment });
  } catch (error) {
    console.error('Resolve comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/comments/:id/unresolve - Unresolve comment
router.put('/comments/:id/unresolve', getAuthenticatedUser, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const comment = await teamService.unresolveComment(commentId);
    res.json({ comment });
  } catch (error) {
    console.error('Unresolve comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ HIGH RISK WATCH ROUTES ============

// GET /api/team/teams/:id/high-risk-watches - Get high risk watches
router.get('/teams/:id/high-risk-watches', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    const watches = await teamService.getHighRiskWatches(teamId);
    res.json({ watches });
  } catch (error) {
    console.error('Get high risk watches error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/teams/:id/high-risk-watches - Create high risk watch
router.post('/teams/:id/high-risk-watches', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { repository_id, risk_threshold, notify_team_members } = req.body;
    
    const isAdmin = await teamService.isTeamAdmin(teamId, req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can create high risk watches' });
    }
    
    if (!repository_id) {
      return res.status(400).json({ error: 'repository_id is required' });
    }
    
    const watch = await teamService.createHighRiskWatch(
      teamId,
      repository_id,
      risk_threshold || 0.7,
      notify_team_members !== false
    );
    
    res.status(201).json({ watch });
  } catch (error) {
    console.error('Create high risk watch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/team/teams/:id/high-risk-watches/:repositoryId - Delete high risk watch
router.delete('/teams/:id/high-risk-watches/:repositoryId', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const repositoryId = parseInt(req.params.repositoryId);
    
    const isAdmin = await teamService.isTeamAdmin(teamId, req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete high risk watches' });
    }
    
    await query(
      'DELETE FROM high_risk_watches WHERE team_id = $1 AND repository_id = $2',
      [teamId, repositoryId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete high risk watch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team/teams/:id/check-high-risk - Manually check high risk PRs
router.post('/teams/:id/check-high-risk', getAuthenticatedUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    const isMember = await teamService.isTeamMember(teamId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    
    await teamService.checkHighRiskPRs(teamId);
    res.json({ success: true, message: 'High risk PR check completed' });
  } catch (error) {
    console.error('Check high risk error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

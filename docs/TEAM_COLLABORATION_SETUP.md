# Team Collaboration Features Setup Guide

## Prerequisites

1. **PostgreSQL Database** - Ensure PostgreSQL is running
2. **Node.js** - v18+ recommended
3. **Backend server** running on port 3001
4. **Frontend** running on port 3000

## Setup Steps

### 1. Database Setup

The migration should already be applied, but if you need to run it manually:

```bash
cd backend
node src/config/migrations/011_team_collaboration.js
```

This creates the following tables:
- `teams` - Team workspaces
- `team_members` - Team membership
- `team_invitations` - Invitation system
- `team_watchlists` - Shared repository watchlists
- `notifications` - User notifications
- `pr_comments` - Comment threads on PRs
- `comment_mentions` - @mention tracking
- `high_risk_watches` - High-risk PR monitoring

### 2. Backend Setup

```bash
cd backend

# Install dependencies (if needed)
npm install

# Start the server
node src/index.js
```

The server will run on `http://localhost:3001` with:
- REST API at `/api/team/*`
- WebSocket for real-time notifications at `/ws`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies (if needed)
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000/team`

### 4. Environment Variables

In `backend/.env`, ensure these are set:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/repopulse
PORT=3001
FRONTEND_URL=http://localhost:3000
GITHUB_TOKEN=your_github_token  # Optional - for GitHub OAuth
```

### 5. Running the Migration

If you need to run the migration again:

```bash
cd backend
node src/config/migrations/011_team_collaboration.js
```

Expected output:
```
🔄 Running team collaboration migration...
✅ Connected to PostgreSQL database
✅ Team collaboration tables created successfully!

📋 Created tables:
   - comment_mentions
   - high_risk_watches
   - notifications
   - pr_comments
   - team_invitations
   - team_members
   - team_watchlists
   - teams

✅ Team collaboration migration complete!
```

## Testing the Features

### 1. Test User Registration

```bash
curl -X POST http://localhost:3001/api/team/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "display_name": "Test User"
  }'
```

### 2. Test Team Creation

```bash
curl -X POST http://localhost:3001/api/team/teams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Team",
    "description": "A test team"
  }'
```

### 3. Access the Frontend

Navigate to: `http://localhost:3000/team`

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/team/auth/register` | POST | Register new user |
| `/api/team/auth/login` | POST | Login user |
| `/api/team/auth/github` | POST | GitHub OAuth |
| `/api/team/auth/me` | GET | Get current user |
| `/api/team/teams` | GET | List user's teams |
| `/api/team/teams` | POST | Create new team |
| `/api/team/teams/:id` | GET | Get team details |
| `/api/team/teams/:id/members` | GET | List team members |
| `/api/team/teams/:id/watchlist` | GET | Get team watchlist |
| `/api/team/notifications` | GET | Get notifications |
| `/api/team/pull-requests/:id/comments` | GET | Get PR comments |
| `/api/team/pull-requests/:id/comments` | POST | Create comment |

## Features Walkthrough

### Creating a Team
1. Go to `/team` page
2. Click "+ New Team"
3. Enter team name and description
4. Click "Create Team"

### Adding Members
1. Select a team from the list
2. In Team Members section, use the API to add members:
```bash
curl -X POST http://localhost:3001/api/team/teams/1/members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email": "member@example.com", "role": "member"}'
```

### Setting Up Watchlist
1. Select a team
2. Add repositories to watch via API:
```bash
curl -X POST http://localhost:3001/api/team/teams/1/watchlist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"repository_id": 1}'
```

### High-Risk PR Notifications
1. Set up high-risk watch:
```bash
curl -X POST http://localhost:3001/api/team/teams/1/high-risk-watches \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"repository_id": 1, "risk_threshold": 0.7}'
```

### Commenting on PRs
1. Add comments via API:
```bash
curl -X POST http://localhost:3001/api/team/pull-requests/1/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"content": "This PR looks risky because @username needs to review it", "team_id": 1}'
```

## Troubleshooting

### Migration Fails
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in .env
- Check if tables already exist

### 401 Errors
- Ensure you're passing the Authorization header with Bearer token
- Token is returned from login/register responses

### WebSocket Not Connecting
- Ensure the backend is running
- Check firewall settings for WebSocket port

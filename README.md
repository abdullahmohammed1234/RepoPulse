# RepoPulse - AI-Powered Repository Analytics Dashboard

<p align="center">
  <img src="https://img.shields.io/badge/RepoPulse-v2.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Stack-Next.js%20%7C%20Express%20%7C%20Python%20%7C%20PostgreSQL-blueviolet.svg" alt="Stack">
</p>

RepoPulse is an enterprise-grade AI-powered GitHub repository analytics platform that provides:

- 🔍 **Risk Detection** - Identifies risky pull requests with ML-powered analysis
- 📊 **Code Quality** - Comprehensive code quality metrics and analysis
- 🔮 **Predictive Analytics** - File churn prediction and trend analysis
- ⚠️ **Anomaly Detection** - Identifies unusual contributor patterns
- 📈 **Health Scores** - Repository health scoring with detailed breakdowns
- ⚡ **Real-time Updates** - Live data via WebSocket connections
- 👥 **Team Collaboration** - Multi-user workspace with role-based access
- 🔌 **Webhooks** - Event-driven integrations with external systems
- 🧪 **Prompt Experiments** - A/B testing for AI prompt optimization
- 📊 **Visual Analytics** - Advanced visualizations and trend analysis
- ⚖️ **Benchmarking** - Compare repository performance against industry standards

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- GitHub Personal Access Token

### 1. Clone and Setup

```bash
# Clone the repository
cd repo-pulse

# Install backend dependencies
cd backend
npm install

# Install ML service dependencies
cd ../ml-service
pip install -r requirements.txt

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb repopulse

# Run database migrations
cd ../backend
npm run db:init

# Optionally seed with demo data
npm run seed
```

### 3. Environment Configuration

Create `.env` files in each service directory:

**Backend (.env)**
```env
PORT=3001
DATABASE_URL=postgresql://localhost:5432/repopulse
GITHUB_TOKEN=your_github_personal_access_token
ML_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Start Services

```bash
# Start ML Service (Terminal 1)
cd ml-service
python -m uvicorn app.main:app --reload --port 8000

# Start Backend API (Terminal 2)
cd backend
npm run dev

# Start Frontend (Terminal 3)
cd frontend
npm run dev
```

### 5. Use RepoPulse

1. Open http://localhost:3000
2. Enter a GitHub repository URL (e.g., `facebook/react`)
3. Click "Analyze"

## 📁 Project Structure

```
repo-pulse/
├── backend/               # Node.js Express API
│   ├── src/
│   │   ├── config/      # Database migrations & configuration
│   │   ├── routes/     # API endpoints
│   │   ├── services/   # Business logic
│   │   ├── middleware/ # Request validation
│   │   ├── queue/      # Background job processing
│   │   └── index.js    # Server entry point
│   └── package.json
│
├── ml-service/           # Python FastAPI ML Service
│   ├── app/
│   │   ├── models/      # ML models
│   │   ├── routers/     # API routes
│   │   └── main.py      # Service entry point
│   └── requirements.txt
│
├── frontend/            # Next.js 14 App Router
│   ├── app/             # Pages & routing
│   ├── components/     # React components
│   ├── lib/            # Utilities & hooks
│   ├── config/         # Configuration
│   └── package.json
│
└── docs/               # Documentation
```

## 🎯 Features

### Core Analytics
- Repository overview with health scores
- Pull request risk analysis
- Hotspot file identification
- Contributor network analysis
- Code dependency graphing

### AI-Powered Analysis
- Multi-model LLM routing for optimal responses
- AI-generated repository insights
- Prompt experimentation framework
- Code quality evaluation

### Workflows & Automation
- Custom workflow creation
- Automated task scheduling
- Webhook integrations
- Real-time event streaming

### Team Collaboration
- Multi-user workspaces
- Role-based access control
- Shared analytics dashboards
- Team performance metrics

### Benchmarking
- Industry benchmark comparisons
- Performance trending
- Quality metrics tracking

## 🔌 API Endpoints

### Repository Analysis
- `POST /api/repository/analyze` - Analyze a repository
- `GET /api/repository/:id/overview` - Get repository overview
- `GET /api/repository/:id/pull-requests` - Get PRs with filters
- `GET /api/repository/:id/hotspots` - Get hotspot files
- `GET /api/repository/:id/contributors` - Get contributors

### Pull Request Details
- `GET /api/pull-request/:id/details` - Get PR details with risk factors

### Analytics & Reporting
- `GET /api/analytics/*` - Comprehensive analytics endpoints
- `GET /api/benchmark/*` - Benchmark comparisons
- `GET /api/code-quality/*` - Code quality metrics

### AI & ML
- `POST /api/evaluation/*` - AI evaluation endpoints
- `POST /api/prompt-experiments/*` - Prompt A/B testing
- `POST /api/model-router/*` - Multi-model routing

### Workflow & Automation
- `GET /api/workflows/*` - Workflow management
- `POST /api/webhooks/*` - Webhook configuration
- `WS /api/realtime` - Real-time updates

### Team Features
- `GET /api/team/*` - Team management
- `POST /api/feedback/*` - User feedback

## 🧠 ML Models

| Model | Type | Purpose |
|-------|------|---------|
| PR Risk Model | RandomForestClassifier | Predicts risk score (0-1) for pull requests |
| File Churn Model | RandomForestRegressor | Predicts file churn probability |
| Anomaly Detector | IsolationForest | Detects unusual contributor patterns |
| Risk Assessment | GradientBoosting | Repository risk scoring |

## 📊 Health Score Calculation

```
health_score = 100 
  - (avg_pr_risk * 30) 
  - (high_churn_files * 2) 
  - (anomaly_count * 5) 
  - ((100 - merge_velocity) * 0.1 * 10)
```

Clamped between 0 and 100.

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Recharts, TanStack Query
- **Backend**: Node.js, Express, Octokit, PostgreSQL, WebSocket
- **ML Service**: Python, FastAPI, scikit-learn, pandas
- **Database**: PostgreSQL with advanced schema (13+ migrations)
- **Real-time**: WebSocket for live updates

## 📱 Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard with repository analytics |
| `/benchmark` | Benchmark comparison tools |
| `/simulations/history` | Analysis history and replay |
| `/admin/prompt-experiments` | AI prompt A/B testing |
| `/admin/workflows` | Workflow management |
| `/admin/analytics` | Advanced analytics |
| `/admin/analytics/visualizations` | Custom visualizations |
| `/admin/trends` | Trend analysis |
| `/admin/webhooks` | Webhook configuration |
| `/admin/code-quality` | Code quality metrics |
| `/team` | Team collaboration hub |
| `/repository/:id` | Repository detailed view |
| `/repository/:id/simulate` | Simulation playground |

## 🔧 Development

```bash
# Run backend in development mode
cd backend
npm run dev

# Run frontend in development mode
cd frontend
npm run dev

# Build frontend for production
cd frontend
npm run build

# Run database migrations
cd backend
npm run db:init

# Seed database with demo data
cd backend
npm run seed
```

## 📝 License

MIT License - feel free to use for your projects!

## 🤝 Contributing

See CONTRIBUTING.md for detailed contribution guidelines.

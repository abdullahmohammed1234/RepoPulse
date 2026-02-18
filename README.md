# RepoPulse - AI-Powered Repository Analytics Dashboard

<p align="center">
  <img src="https://img.shields.io/badge/RepoPulse-v1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Stack-Next.js%20%7C%20Express%20%7C%20Python%20%7C%20PostgreSQL-blueviolet.svg" alt="Stack">
</p>

RepoPulse is an AI-powered GitHub repository analytics dashboard that:

- 🔍 Detects risky pull requests
- 📊 Identifies code bottlenecks  
- 🔮 Predicts file churn
- ⚠️ Detects contributor anomalies
- 📈 Generates repository health scores

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
│   │   ├── config/      # Database & configuration
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   └── index.js     # Server entry point
│   └── package.json
│
├── ml-service/           # Python FastAPI ML Service
│   ├── app/
│   │   ├── models/      # ML models
│   │   ├── routers/     # API routes
│   │   └── main.py      # Service entry point
│   └── requirements.txt
│
└── frontend/            # Next.js App Router
    ├── app/             # Pages & components
    ├── components/      # React components
    └── package.json
```

## 🔌 API Endpoints

### Repository Analysis
- `POST /api/repository/analyze` - Analyze a repository

### Repository Data
- `GET /api/repository/:id/overview` - Get repository overview
- `GET /api/repository/:id/pull-requests` - Get PRs with filters
- `GET /api/repository/:id/hotspots` - Get hotspot files
- `GET /api/repository/:id/contributors` - Get contributors

### Pull Request Details
- `GET /api/pull-request/:id/details` - Get PR details with risk factors

## 🧠 ML Models

| Model | Type | Purpose |
|-------|------|---------|
| PR Risk Model | RandomForestClassifier | Predicts risk score (0-1) for pull requests |
| File Churn Model | RandomForestRegressor | Predicts file churn probability |
| Anomaly Detector | IsolationForest | Detects unusual contributor patterns |

## 📊 Health Score Calculation

```
health_score = 100 
  - (avg_pr_risk * 30) 
  - (high_churn_files * 2) 
  - (anomaly_count * 5) 
  - ((100 - merge_velocity) * 0.1 * 10)
```

Clamped between 0 and 100.

## 🔧 Tech Stack

- **Frontend**: Next.js 14, React, TailwindCSS, Recharts
- **Backend**: Node.js, Express, Octokit, PostgreSQL
- **ML Service**: Python, FastAPI, scikit-learn, pandas
- **Database**: PostgreSQL with relational schema

## 📝 License

MIT License - feel free to use for your hackathon projects!

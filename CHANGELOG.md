# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Team collaboration features with shared watchlists
- Real-time WebSocket notifications
- Multi-model AI routing (GPT-4, Claude, Gemini)
- Workflow automation system
- AI self-evaluation layer
- Prompt experimentation framework
- Historical metrics tracking

### Changed
- Improved code quality analysis algorithms
- Enhanced feedback system with rating and comments
- Updated database schema for better performance

### Fixed
- Memory leak in WebSocket connections
- Race condition in concurrent generation requests

## [1.0.0] - 2024-01-15

### Added
- Repository analytics dashboard
- PR risk detection using ML models
- File churn prediction
- Contributor anomaly detection
- Repository health scoring
- GitHub API integration
- User feedback system
- Version control for AI generations
- Personalization features (tone, length, industry)
- Export functionality (PDF, Markdown, JSON)
- Team collaboration features
- Benchmark comparisons
- Code quality metrics

### Features

#### Core Analytics
- Repository overview with health metrics
- Pull request analysis with risk factors
- Hotspot file detection
- Contributor activity tracking

#### ML Models
- PR Risk Model (RandomForestClassifier)
- File Churn Model (RandomForestRegressor)
- Anomaly Detector (IsolationForest)

#### User Features
- User authentication and sessions
- Personalized AI outputs
- Generation version history
- Export to multiple formats

#### Team Features
- Team workspaces
- Shared repository watchlists
- High-risk PR monitoring
- Comment threads on PRs
- Real-time notifications

### Tech Stack
- Frontend: Next.js 14, React, TailwindCSS, Recharts
- Backend: Node.js, Express, Octokit, PostgreSQL
- ML Service: Python, FastAPI, scikit-learn, pandas
- Database: PostgreSQL with relational schema

### Database Migrations
- 001_initial_schema - Core tables
- 002_memory_versioning - Version control
- 003_simulation_history - History tracking
- 004_feedback_system - User feedback
- 005_feedback_nullable_generation - Nullable fields
- 006_prompt_experiments - A/B testing
- 007_ai_evaluation - Self-evaluation
- 008_workflow_expansion - Workflow automation
- 009_multi_model_routing - Multi-model support
- 010_webhooks_realtime - WebSocket support
- 011_team_collaboration - Team features
- 012_add_team_user_fields - User fields
- 013_historical_metrics - Historical data

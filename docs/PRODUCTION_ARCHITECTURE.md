# RepoPulse Production Architecture Documentation

## Executive Summary

This document describes the production-ready architecture for the RepoPulse AI-powered repository analytics system. The system has been evolved from a working prototype into a production-grade platform with comprehensive resilience, observability, and personalization features.

---

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Benchmark │  │  Simulation │  │   History   │  │  Preferences    │ │
│  │    Page     │  │    Page      │  │    View     │  │     Panel       │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND API (Express.js)                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Middleware Layer                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────────┐  │  │
│  │  │  Validation │ │   Rate      │ │Correlation  │ │    Auth        │  │  │
│  │  │   Layer     │ │   Limiter   │ │    ID       │ │   Middleware   │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Service Layer                                 │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────────┐  │  │
│  │  │     AI      │ │   Version   │ │   Memory    │ │   Export       │  │  │
│  │  │ Generation  │ │   Service   │ │   Service   │ │   Service      │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────────────┘  │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────────┐  │  │
│  │  │  Personal   │ │    ML       │ │   Output    │ │   Retry        │  │  │
│  │  │ ization     │ │   Service   │ │ Validation  │ │   Service      │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   GitHub API   │  │  AI Provider    │  │    Notion API (Ready)       │ │
│  │                 │  │   (OpenAI)     │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER (PostgreSQL)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │Repositories │  │  Generations │  │   Versions  │  │    Memories     │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │User Prefs   │  │   Exports   │  │   Sessions  │  │   Rate Limits   │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema

### Core Tables

#### generations
```sql
- id: UUID PRIMARY KEY
- user_id: UUID (FK to users)
- session_id: UUID (FK to sessions)
- repository_id: INTEGER (FK to repositories)
- parent_version_id: UUID (self-referencing)
- prompt: TEXT
- content: JSONB
- raw_output: TEXT
- version: VARCHAR(20) -- e.g., 'v1', 'v2'
- version_number: INTEGER
- section: VARCHAR(50) -- 'summary', 'recommendations', 'analysis', etc.
- model: VARCHAR(100)
- tokens_used: INTEGER
- latency_ms: INTEGER
- rating: INTEGER (1-5)
- feedback: TEXT
- status: VARCHAR(20) -- 'active', 'archived', 'deleted'
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### versions
```sql
- id: UUID PRIMARY KEY
- generation_id: UUID (FK)
- version_number: INTEGER
- content: JSONB
- change_summary: TEXT
- change_type: VARCHAR(20) -- 'initial', 'regenerate', 'edit', 'restore', 'partial_regenerate'
- regenerated_section: VARCHAR(50)
- created_at: TIMESTAMP
- created_by: UUID
```

#### memories
```sql
- id: UUID PRIMARY KEY
- user_id: UUID (FK)
- session_id: UUID (FK)
- generation_id: UUID (FK)
- memory_type: VARCHAR(50) -- 'short_term', 'long_term', 'context', 'fact', 'preference'
- content: TEXT
- importance_score: FLOAT (0-1)
- source: VARCHAR(50)
- is_active: BOOLEAN
- created_at: TIMESTAMP
- last_accessed_at: TIMESTAMP
- expires_at: TIMESTAMP
```

#### user_preferences
```sql
- id: UUID PRIMARY KEY
- user_id: UUID UNIQUE
- tone: VARCHAR(20) -- 'formal', 'casual', 'persuasive', 'technical'
- output_length: VARCHAR(20) -- 'short', 'medium', 'long'
- industry: VARCHAR(100)
- custom_instructions: TEXT
- notify_on_complete: BOOLEAN
- notify_on_error: BOOLEAN
- default_export_format: VARCHAR(20)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

---

## 3. Optimized Prompt

### System Prompt
```
You are RepoPulse, an AI-powered repository analytics assistant. Your role is to 
provide actionable insights about software repositories based on engineering health metrics.

## Your Capabilities
- Analyze repository health and risk metrics
- Generate actionable recommendations
- Identify risk factors in pull requests
- Provide comparative benchmarking insights

## Output Format
You must always respond with valid JSON in the following schema:
{
  "summary": "string - Executive summary of findings",
  "recommendations": ["string[] - Actionable recommendations"],
  "risk_factors": ["string[] - Identified risk factors"],
  "analysis": {
    "health_score": "number (0-100)",
    "trend": "string (increasing/decreasing/stable)",
    "key_insights": ["string[] - Key data points"]
  },
  "confidence": "number (0-1) - Confidence in the analysis"
}

## Guidelines
- Be precise with numbers and metrics
- Focus on actionable insights
- Prioritize risk identification
- Maintain technical accuracy
- Keep summaries concise but informative
```

### Section-Specific Prompts

**Summary Regeneration:**
```
Generate an executive summary for this repository analysis. Focus on:
- Overall health status
- Key metrics
- Primary recommendations
Keep it concise (2-3 sentences).
```

**Recommendations Regeneration:**
```
Generate actionable recommendations based on the repository data. Focus on:
- Specific improvements
- Priority actions
- Expected impact
Provide 3-5 concrete recommendations.
```

### Expected Output Schema
```json
{
  "summary": "string",
  "recommendations": ["string"],
  "risk_factors": ["string"],
  "analysis": {
    "health_score": "number",
    "trend": "string",
    "key_insights": ["string"]
  },
  "confidence": "number"
}
```

---

## 4. Memory Injection Logic

### Token Budget Strategy
- **Max Context Tokens:** 4,000
- **Max History Tokens:** 2,000  
- **Max Memories Tokens:** 2,000

### Context Building Process
1. **Fetch User Preferences** - Get tone, length, and custom instructions
2. **Fetch Relevant Memories** - Get memories sorted by importance score, filtered by token budget
3. **Fetch Recent Generations** - Get previous generations for context, filtered by token budget
4. **Inject into Prompt** - Append memory and history context to the system prompt

### Memory Types
- **short_term:** Session-based, expires after session ends
- **long_term:** Persisted indefinitely
- **context:** General context from previous interactions
- **fact:** Extracted facts from analysis results
- **preference:** User preference patterns learned over time

---

## 5. Logging Structure

### Event Types
```javascript
const EVENT_TYPES = {
  // User events
  USER_ACTION: 'user_action',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  
  // Generation events
  GENERATE_START: 'generate_start',
  GENERATE_COMPLETE: 'generate_complete',
  GENERATE_ERROR: 'generate_error',
  REGENERATE_SECTION: 'regenerate_section',
  
  // ML events
  ML_PREDICTION_START: 'ml_prediction_start',
  ML_PREDICTION_COMPLETE: 'ml_prediction_complete',
  ML_PREDICTION_ERROR: 'ml_prediction_error',
  
  // Version events
  VERSION_CREATE: 'version_create',
  VERSION_RESTORE: 'version_restore',
  VERSION_COMPARE: 'version_compare',
  
  // Export events
  EXPORT_START: 'export_start',
  EXPORT_COMPLETE: 'export_complete',
  EXPORT_ERROR: 'export_error',
  
  // System events
  API_REQUEST: 'api_request',
  API_RESPONSE: 'api_response',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  VALIDATION_ERROR: 'validation_error'
};
```

### Log Format (JSON)
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "Generation completed",
  "service": "repopulse",
  "environment": "production",
  "event": "generate_complete",
  "correlationId": "uuid-v4",
  "userId": "uuid-v4",
  "tokensUsed": 1500,
  "latency": 2500,
  "model": "gpt-4",
  "version": "v2"
}
```

### Metrics Tracked
- Total requests (success/failure)
- Generations (total, tokens used, latency)
- ML Predictions (by type, latency)
- Exports (by format)
- Rate limit hits

---

## 6. Versioning Model

### Version Numbering
- Initial generation: `v1`
- First regeneration: `v2`
- First restore: `v3` (same content as restored version)
- Partial regeneration: `vX`

### Change Types
1. **initial** - First generation
2. **regenerate** - Full content regeneration
3. **edit** - Manual edits
4. **restore** - Restored from previous version
5. **partial_regenerate** - Only specific section regenerated

### Version Storage
- Each generation maintains full version history
- All versions are immutable
- Version comparison available via diff API

---

## 7. API Structure Overview

### Core Endpoints

#### Generation
- `POST /api/generate` - Create new generation
- `POST /api/generate/regenerate-section` - Regenerate specific section
- `GET /api/generations/history/:repositoryId` - Get generation history
- `GET /api/generations/detail/:generationId` - Get generation details
- `POST /api/generations/restore` - Restore a version
- `POST /api/generations/compare` - Compare two versions
- `POST /api/generations/feedback` - Submit feedback

#### Export
- `POST /api/export` - Export generation to format
- `GET /api/export/history` - Get export history

#### Preferences
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update preferences

#### Memory
- `GET /api/memory` - Get user memories
- `DELETE /api/memory/:memoryId` - Delete a memory

---

## 8. Security Considerations

### Input Validation
- All inputs validated using Joi schemas
- Prompt injection detection patterns
- Rate limiting per user/endpoint
- UUID validation for IDs
- Max length limits enforced

### Prompt Injection Prevention
```javascript
const injectionPatterns = [
  /ignore\s+(previous|above|all|prior)\s+(instructions?|rules?|prompts?)/i,
  /system\s*:\s*/i,
  /<system>/i,
  /override\s+(security|safety)/i,
  /you\s+are\s+(now|no\s+longer)/i,
  /forget\s+(everything|all|what)/i,
  /new\s+instructions/i,
  /##system/i,
  /\[SYSTEM\]/i
];
```

### Output Sanitization
- JSON schema validation on all outputs
- Fallback responses on validation failure
- Safe defaults for malformed data

---

## 9. Scalability Considerations

### Horizontal Scaling
- Stateless API design
- Session data in database
- Cache-friendly responses

### Database Optimization
- Proper indexing on all foreign keys
- Pagination on all list endpoints
- JSONB for flexible content storage

### Performance
- Token budgeting for context
- Debounced simulation inputs
- Lazy loading of version history
- Circuit breaker for ML service

### Rate Limiting
- Token bucket algorithm
- Per-user and per-IP limits
- Configurable windows and limits

---

## 10. Error Handling

### Fallback Responses
- ML service failures return default risk scores
- Validation failures return safe defaults
- Network errors trigger retry with exponential backoff

### Error States
- 400: Validation errors (detailed field-level errors)
- 404: Resource not found
- 429: Rate limit exceeded
- 500: Internal server error
- 503: Service unavailable (circuit breaker open)

---

## 11. Export Formats

### Supported Formats
1. **PDF** - HTML-based PDF generation ready
2. **Markdown** - Clean markdown output
3. **JSON** - Structured data export
4. **Notion** - Notion block structure ready for API

---

## 12. Personalization Features

### Preference Types
- **Tone:** formal, casual, persuasive, technical
- **Length:** short, medium, long
- **Industry:** Custom industry context
- **Custom Instructions:** Free-form user instructions
- **Default Export Format:** pdf, markdown, json, notion
- **Notifications:** On completion, on error

### Learning from Feedback
- Detects tone/length preferences from feedback
- Auto-updates preferences based on user reactions

---

## Installation & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

### Database Migration
```bash
node src/config/migrations/002_memory_versioning.js
```

### Environment Variables
```env
# AI Provider
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=postgresql://...

# Rate Limiting
RATE_LIMIT_WINDOW=3600
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial production release |

---

## Future Enhancements

- Real-time collaboration
- Team sharing and workspaces
- Webhook integrations
- Advanced analytics dashboard
- Custom model fine-tuning

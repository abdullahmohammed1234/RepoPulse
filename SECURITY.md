# Security Policy

This document outlines the security practices and policies for the RepoPulse project.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please send an email to the security team. All security vulnerabilities will be promptly addressed.

### What to Include

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 24 hours
- **Severity Assessment**: Within 48 hours  
- **Fix Timeline**: Based on severity (see below)

### Severity Classification

| Severity | Response Time | Fix Target |
|----------|---------------|------------|
| Critical | 24 hours | 7 days |
| High     | 48 hours | 14 days |
| Medium   | 72 hours | 30 days |
| Low      | 1 week  | Next release |

## Security Best Practices

### Authentication

- All API endpoints require authentication (except public read endpoints)
- Use secure token-based authentication
- Tokens should be stored securely (environment variables, not in code)
- Implement token expiration and rotation

### Input Validation

All user inputs are validated using:
- Joi schema validation
- Type checking for all parameters
- Length limits on string inputs
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)

### Prompt Injection Prevention

The system includes protection against prompt injection attacks:

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

### Rate Limiting

- Per-user rate limits to prevent abuse
- Token bucket algorithm implementation
- Configurable limits per endpoint

### Data Protection

- Environment variables for sensitive data
- No hardcoded credentials
- Secure database connections
- HTTPS for all production traffic

### API Security

- CORS configured for allowed origins only
- Helmet.js for security headers
- Request size limits
- Correlation IDs for tracing

## Environment Variables Security

Never commit sensitive information to version control. Use `.env.example` for templates:

```env
# Required - Keep secret
DATABASE_URL=postgresql://user:password@host:port/db
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx

# Public - Safe to share
NEXT_PUBLIC_API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

## Dependency Security

### Regular Updates

- Keep Node.js dependencies updated
- Run security audits regularly:

```bash
# Backend
cd backend
npm audit

# Frontend
cd frontend
npm audit

# ML Service
cd ml-service
pip-audit
```

### Vulnerability Scanning

We use npm's built-in security features. Run before deploying:

```bash
npm audit --audit-level=moderate
```

## Logging & Monitoring

- All security events are logged
- Failed authentication attempts
- Rate limit violations
- Input validation failures
- Unusual access patterns

## Error Handling

- Don't expose internal error details to users
- Generic error messages in production
- Detailed logs for debugging
- Proper HTTP status codes

## Data Retention

- User feedback data: 90 days
- Session data: Session-based (cleared on logout)
- Analytics data: Configurable retention period

## Compliance

For enterprise deployments, ensure:
- GDPR compliance for EU users
- Data encryption at rest
- Audit logging
- Access controls

## Security Contact

For security issues, contact: **security@repopulse.dev**

---
*Last updated: February 2024*

# Contributing to RepoPulse

Thank you for your interest in contributing to RepoPulse! This document outlines the guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:

- Be respectful and inclusive
- Accept constructive criticism professionally
- Focus on what's best for the community
- Show empathy towards other contributors

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- GitHub Personal Access Token

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/your-repo/repo-pulse.git
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

# Copy environment files
cp .env.example .env  # Backend
cp .env.example .env.local  # Frontend
```

### Running Development Servers

```bash
# Terminal 1: ML Service
cd ml-service
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2: Backend API
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards

3. **Write tests** for new functionality

4. **Commit your changes** following commit message guidelines

5. **Push to your fork** and create a pull request

## Pull Request Process

### Before Submitting

- [ ] Code follows our coding standards
- [ ] Tests pass locally (`npm test` in each service)
- [ ] Documentation is updated if needed
- [ ] Commit messages follow the convention

### PR Title Format

Use one of these prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding/updating tests
- `chore:` - Maintenance tasks

### Example PR Titles
```
feat: Add team collaboration watchlist feature
fix: Resolve PR risk score calculation error
docs: Update API endpoint documentation
```

### PR Description

Include in your PR description:
1. **What** - Brief description of changes
2. **Why** - Reason for the change
3. **How** - Overview of implementation
4. **Testing** - How you tested the changes

## Coding Standards

### JavaScript/TypeScript

- Use **ESLint** for linting
- Use Prettier for formatting
- 2 spaces for indentation
- Use `const` over `let`, avoid `var`
- Use meaningful variable names

```javascript
// Good
const repositoryId = req.params.id;
const metrics = await analyticsService.getMetrics(repositoryId);

// Avoid
const x = req.params.id;
const m = await analyticsService.getMetrics(x);
```

### React Components

- Use functional components with hooks
- Place props destructuring at the top
- Keep components small and focused
- Use TypeScript for prop types

```tsx
// Good
interface Props {
  title: string;
  onSubmit: () => void;
}

export function SubmitButton({ title, onSubmit }: Props) {
  return <button onClick={onSubmit}>{title}</button>;
}
```

### SQL/PostgreSQL

- Use meaningful table and column names
- Add comments for complex queries
- Use migrations for schema changes
- Index foreign keys and frequently queried columns

### Python

- Follow PEP 8 style guide
- Use type hints where appropriate
- Use docstrings for functions and classes

## Commit Messages

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

### Example

```
feat(analytics): Add dashboard metrics endpoint

- Added endpoint to fetch daily active users
- Added endpoint to fetch error rates
- Included caching for performance

Closes #123
```

## Testing

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### Running All Tests

```bash
npm run test:all
```

### Test Coverage

Aim for at least **80% code coverage** for new features.

## Documentation

### Code Documentation

- Add JSDoc comments for all exported functions
- Document complex algorithms with comments
- Keep comments up-to-date with code changes

### API Documentation

When adding new endpoints:
1. Add JSDoc comment with endpoint description
2. Include request/response examples
3. Update README.md or create API.md entry

```javascript
/**
 * GET /api/repository/:id/overview
 * Get repository overview metrics
 * 
 * @param {string} req.params.id - Repository ID
 * @returns {Object} Repository overview data
 * 
 * @example
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "name": "facebook/react",
 *     "health_score": 85,
 *     "open_prs": 42
 *   }
 * }
 */
```

## Questions?

- Open an issue for bugs or feature requests
- Use discussions for questions
- Join our community chat (link in README)

## License

By contributing to RepoPulse, you agree that your contributions will be licensed under the MIT License.

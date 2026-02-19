require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const repositoryRoutes = require('./routes/repositoryRoutes');
const prRoutes = require('./routes/prRoutes');
const benchmarkRoutes = require('./routes/benchmarkRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const generationRoutes = require('./routes/generationRoutes');
const exportRoutes = require('./routes/exportRoutes');
const personalizationRoutes = require('./routes/personalizationRoutes');
const promptExperimentRoutes = require('./routes/promptExperimentRoutes');
const evaluationRoutes = require('./routes/evaluationRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const modelRouterRoutes = require('./routes/modelRouterRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/repository', repositoryRoutes);
app.use('/api/pull-request', prRoutes);
app.use('/api/benchmark', benchmarkRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/generation', generationRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/personalization', personalizationRoutes);
app.use('/api/prompt-experiments', promptExperimentRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/model-router', modelRouterRoutes);
app.use('/api/analytics', analyticsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 RepoPulse Backend Server                            ║
║                                                           ║
║   Server running on: http://localhost:${PORT}              ║
║   Environment: ${process.env.NODE_ENV || 'development'}                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;

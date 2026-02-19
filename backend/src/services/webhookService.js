/**
 * Webhook Service
 * Handles GitHub webhook processing and event management
 */

const { query, pool } = require('../config/db');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');

// Ensure logger has required methods
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[WEBHOOK INFO]', msg);
  logger.warn = (msg) => console.log('[WEBHOOK WARN]', msg);
  logger.error = (msg) => console.error('[WEBHOOK ERROR]', msg);
}

// WebSocket broadcast function (will be set from index.js)
let broadcastToClients = null;

/**
 * Set the broadcast function for WebSocket connections
 */
function setBroadcastFunction(fn) {
  broadcastToClients = fn;
}

/**
 * Create webhook configuration for a repository
 */
async function createWebhookConfig(repositoryId, webhookUrl, events = ['push', 'pull_request', 'issues'], secret = null) {
  try {
    // Ensure events is a proper JSON string
    const eventsJson = typeof events === 'string' ? events : JSON.stringify(events);
    
    const result = await query(
      `INSERT INTO webhook_configs (repository_id, webhook_url, secret, events)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (repository_id) DO UPDATE SET
         webhook_url = EXCLUDED.webhook_url,
         secret = EXCLUDED.secret,
         events = EXCLUDED.events,
         updated_at = NOW(),
         is_active = true
       RETURNING *`,
      [repositoryId, webhookUrl, secret, eventsJson]
    );
    
    logger.info(`Webhook config created for repository ${repositoryId}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create webhook config:', error.message);
    throw error;
  }
}

/**
 * Get webhook configuration for a repository
 */
async function getWebhookConfig(repositoryId) {
  try {
    const result = await query(
      'SELECT * FROM webhook_configs WHERE repository_id = $1 AND is_active = true',
      [repositoryId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get webhook config:', error.message);
    throw error;
  }
}

/**
 * List all webhook configurations
 */
async function listWebhookConfigs() {
  try {
    const result = await query(
      `SELECT wc.*, r.name as repo_name, r.full_name, r.owner
       FROM webhook_configs wc
       JOIN repositories r ON wc.repository_id = r.id
       WHERE wc.is_active = true
       ORDER BY wc.updated_at DESC`
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to list webhook configs:', error.message);
    throw error;
  }
}

/**
 * Validate webhook signature
 */
function validateSignature(payload, signature, secret) {
  if (!signature || !secret) return true; // Skip validation if no secret
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (e) {
    return false;
  }
}

/**
 * Process incoming webhook event
 */
async function processWebhookEvent(repositoryId, eventType, payload, deliveryId, signature) {
  const client = await pool.connect();
  
  try {
    // Get webhook config to validate signature
    const configResult = await client.query(
      'SELECT * FROM webhook_configs WHERE repository_id = $1 AND is_active = true',
      [repositoryId]
    );
    
    const config = configResult.rows[0];
    let signatureValid = true;
    
    if (config && config.secret) {
      signatureValid = validateSignature(JSON.stringify(payload), signature, config.secret);
    }
    
    // Log the event
    const eventResult = await client.query(
      `INSERT INTO webhook_events (repository_id, event_type, event_action, payload, delivery_id, signature_valid)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [repositoryId, eventType, payload.action || null, JSON.stringify(payload), deliveryId, signatureValid]
    );
    
    const eventId = eventResult.rows[0].id;
    
    if (!signatureValid) {
      logger.warn(`Invalid webhook signature for event ${eventType}`);
      await client.query(
        'UPDATE webhook_events SET processed = true, processing_error = $1, processed_at = NOW() WHERE id = $2',
        ['Invalid signature', eventId]
      );
      return { success: false, error: 'Invalid signature', eventId };
    }
    
    // Process based on event type
    const result = await processEventByType(client, repositoryId, eventType, payload, eventId);
    
    // Mark as processed
    await client.query(
      'UPDATE webhook_events SET processed = true, processed_at = NOW() WHERE id = $1',
      [eventId]
    );
    
    // Broadcast to realtime subscribers
    broadcastEvent(repositoryId, eventType, payload);
    
    // Trigger auto-analysis if configured
    await triggerAutoAnalysis(repositoryId, eventType, payload);
    
    return { success: true, eventId, processed: result };
  } catch (error) {
    logger.error(`Failed to process webhook event: ${error.message}`);
    
    // Update event with error
    try {
      await client.query(
        'UPDATE webhook_events SET processed = true, processing_error = $1, processed_at = NOW() WHERE id = $2',
        [error.message, eventId]
      );
    } catch (e) {
      // Ignore update error
    }
    
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Process event based on type
 */
async function processEventByType(client, repositoryId, eventType, payload, eventId) {
  const results = [];
  
  switch (eventType) {
    case 'push':
      results.push(await processPushEvent(client, repositoryId, payload, eventId));
      break;
      
    case 'pull_request':
      results.push(await processPullRequestEvent(client, repositoryId, payload, eventId));
      break;
      
    case 'issues':
      results.push(await processIssueEvent(client, repositoryId, payload, eventId));
      break;
      
    case 'pull_request_review':
      results.push(await processReviewEvent(client, repositoryId, payload, eventId));
      break;
      
    case 'pull_request_review_comment':
      results.push(await processReviewCommentEvent(client, repositoryId, payload, eventId));
      break;
      
    case 'check_run':
    case 'check_suite':
      results.push(await processCheckEvent(client, repositoryId, payload, eventId));
      break;
      
    case 'create':
    case 'delete':
      results.push(await processBranchTagEvent(client, repositoryId, payload, eventId));
      break;
      
    default:
      logger.info(`Unhandled event type: ${eventType}`);
  }
  
  return results;
}

/**
 * Process push event
 */
async function processPushEvent(client, repositoryId, payload, eventId) {
  const commits = payload.commits || [];
  const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
  
  logger.info(`Processing push event: ${commits.length} commits to ${branch}`);
  
  for (const commit of commits) {
    try {
      await client.query(
        `INSERT INTO commits (repository_id, sha, message, author_name, author_email, committed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (repository_id, sha) DO NOTHING`,
        [
          repositoryId,
          commit.id,
          commit.message,
          commit.author?.name,
          commit.author?.email,
          commit.timestamp
        ]
      );
    } catch (error) {
      logger.error(`Failed to insert commit: ${error.message}`);
    }
  }
  
  // Update repository stats
  await client.query(
    'UPDATE repositories SET updated_at = NOW() WHERE id = $1',
    [repositoryId]
  );
  
  return { type: 'push', commits: commits.length, branch };
}

/**
 * Process pull request event
 */
async function processPullRequestEvent(client, repositoryId, payload, eventId) {
  const pr = payload.pull_request;
  const action = payload.action;
  
  logger.info(`Processing PR event: ${action} for PR #${pr.number}`);
  
  try {
    await client.query(
      `INSERT INTO pull_requests (
        repository_id, github_id, number, title, body, state,
        html_url, lines_added, lines_deleted, files_changed,
        commits_count, review_comments, created_at, updated_at,
        merged_at, closed_at, is_merged
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (repository_id, github_id) DO UPDATE SET
        title = EXCLUDED.title,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        merged_at = EXCLUDED.merged_at,
        closed_at = EXCLUDED.closed_at,
        is_merged = EXCLUDED.is_merged`,
      [
        repositoryId,
        pr.id,
        pr.number,
        pr.title,
        pr.body,
        pr.state,
        pr.html_url,
        pr.additions || 0,
        pr.deletions || 0,
        pr.changed_files || 0,
        pr.commits || 0,
        (pr.comments || 0) + (pr.review_comments || 0),
        pr.created_at,
        pr.updated_at,
        pr.merged_at,
        pr.closed_at,
        pr.merged_at !== null
      ]
    );
  } catch (error) {
    logger.error(`Failed to insert PR: ${error.message}`);
  }
  
  return { type: 'pull_request', action, prNumber: pr.number };
}

/**
 * Process issue event
 */
async function processIssueEvent(client, repositoryId, payload, eventId) {
  const issue = payload.issue;
  const action = payload.action;
  
  logger.info(`Processing issue event: ${action} for issue #${issue.number}`);
  
  // Update repository open issues count
  await client.query(
    'UPDATE repositories SET open_issues = open_issues + $1, updated_at = NOW() WHERE id = $2',
    [action === 'opened' ? 1 : action === 'closed' ? -1 : 0, repositoryId]
  );
  
  return { type: 'issues', action, issueNumber: issue.number };
}

/**
 * Process pull request review event
 */
async function processReviewEvent(client, repositoryId, payload, eventId) {
  const review = payload.review;
  const pr = payload.pull_request;
  
  logger.info(`Processing PR review: ${review.state} for PR #${pr.number}`);
  
  // Could trigger re-analysis based on review state
  return { type: 'pull_request_review', state: review.state, prNumber: pr.number };
}

/**
 * Process review comment event
 */
async function processReviewCommentEvent(client, repositoryId, payload, eventId) {
  const comment = payload.comment;
  const pr = payload.pull_request;
  
  logger.info(`Processing review comment on PR #${pr.number}`);
  
  return { type: 'pull_request_review_comment', prNumber: pr.number };
}

/**
 * Process check run/suite event
 */
async function processCheckEvent(client, repositoryId, payload, eventId) {
  const check = payload.check_run || payload.check_suite;
  const conclusion = check.conclusion;
  
  logger.info(`Processing check event: ${check.name} - ${conclusion || 'pending'}`);
  
  return { type: 'check', name: check.name, conclusion };
}

/**
 * Process branch/tag create/delete event
 */
async function processBranchTagEvent(client, repositoryId, payload, eventId) {
  const refType = payload.ref_type; // branch or tag
  const ref = payload.ref;
  
  logger.info(`Processing ${payload.action} ${refType}: ${ref}`);
  
  return { type: eventType, action: payload.action, refType, ref };
}

/**
 * Broadcast event to realtime subscribers
 */
function broadcastEvent(repositoryId, eventType, payload) {
  if (broadcastToClients) {
    const event = {
      type: 'webhook_event',
      data: {
        repositoryId,
        eventType,
        action: payload.action,
        timestamp: new Date().toISOString(),
        payload: sanitizePayload(payload)
      }
    };
    
    broadcastToClients(repositoryId, event);
    logger.info(`Broadcasted ${eventType} event to subscribers`);
  }
}

/**
 * Sanitize payload to reduce size
 */
function sanitizePayload(payload) {
  return {
    action: payload.action,
    number: payload.number,
    title: payload.title,
    state: payload.state,
    merged: payload.merged,
    head: {
      sha: payload.head?.sha,
      ref: payload.head?.ref
    },
    base: {
      sha: payload.base?.sha,
      ref: payload.base?.ref
    },
    sender: payload.sender?.login,
    commits: payload.commits?.slice(0, 5).map(c => ({
      id: c.id,
      message: c.message?.substring(0, 100),
      author: c.author?.name
    })) || [],
    issue: payload.issue ? {
      number: payload.issue.number,
      title: payload.issue.title,
      state: payload.issue.state
    } : null
  };
}

/**
 * Register a realtime subscription
 */
async function registerSubscription(sessionId, userId, repositoryId, eventTypes = ['*']) {
  try {
    await query(
      `INSERT INTO realtime_subscriptions (session_id, user_id, repository_id, event_types)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id) DO UPDATE SET
         repository_id = EXCLUDED.repository_id,
         event_types = EXCLUDED.event_types,
         is_active = true,
         disconnected_at = NULL,
         last_heartbeat = NOW()`,
      [sessionId, userId, repositoryId, eventTypes]
    );
    
    logger.info(`Registered realtime subscription: ${sessionId}`);
    return true;
  } catch (error) {
    logger.error('Failed to register subscription:', error.message);
    return false;
  }
}

/**
 * Unregister a realtime subscription
 */
async function unregisterSubscription(sessionId) {
  try {
    await query(
      'UPDATE realtime_subscriptions SET is_active = false, disconnected_at = NOW() WHERE session_id = $1',
      [sessionId]
    );
    
    logger.info(`Unregistered realtime subscription: ${sessionId}`);
    return true;
  } catch (error) {
    logger.error('Failed to unregister subscription:', error.message);
    return false;
  }
}

/**
 * Update subscription heartbeat
 */
async function updateHeartbeat(sessionId) {
  try {
    await query(
      'UPDATE realtime_subscriptions SET last_heartbeat = NOW() WHERE session_id = $1',
      [sessionId]
    );
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get active subscriptions for a repository
 */
async function getActiveSubscriptions(repositoryId) {
  try {
    const result = await query(
      `SELECT * FROM realtime_subscriptions 
       WHERE repository_id = $1 AND is_active = true 
       AND disconnected_at IS NULL
       AND last_heartbeat > NOW() - INTERVAL '5 minutes'`,
      [repositoryId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get subscriptions:', error.message);
    return [];
  }
}

/**
 * Create event trigger for auto-analysis
 */
async function createEventTrigger(repositoryId, eventType, triggerAction, config = {}) {
  try {
    const result = await query(
      `INSERT INTO event_triggers (repository_id, event_type, trigger_action, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (repository_id, event_type, trigger_action) DO UPDATE SET
         config = EXCLUDED.config,
         is_active = true
       RETURNING *`,
      [repositoryId, eventType, triggerAction, config]
    );
    
    logger.info(`Created event trigger: ${eventType} -> ${triggerAction}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create event trigger:', error.message);
    throw error;
  }
}

/**
 * Get event triggers for a repository
 */
async function getEventTriggers(repositoryId) {
  try {
    const result = await query(
      'SELECT * FROM event_triggers WHERE repository_id = $1 AND is_active = true',
      [repositoryId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get event triggers:', error.message);
    throw error;
  }
}

/**
 * Trigger auto-analysis based on event
 */
async function triggerAutoAnalysis(repositoryId, eventType, payload) {
  try {
    const triggers = await getEventTriggers(repositoryId);
    
    for (const trigger of triggers) {
      if (trigger.event_type === eventType || trigger.event_type === '*') {
        const shouldTrigger = evaluateTriggerCondition(trigger, payload);
        
        if (shouldTrigger) {
          logger.info(`Triggering auto-analysis: ${trigger.trigger_action} for ${eventType}`);
          
          // Update trigger stats
          await query(
            'UPDATE event_triggers SET last_triggered_at = NOW(), trigger_count = trigger_count + 1 WHERE id = $1',
            [trigger.id]
          );
          
          // Execute trigger action
          await executeTriggerAction(trigger, repositoryId, payload);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to trigger auto-analysis:', error.message);
  }
}

/**
 * Evaluate trigger condition
 */
function evaluateTriggerCondition(trigger, payload) {
  const config = trigger.config || {};
  
  switch (trigger.trigger_action) {
    case 'analyze_pr':
      // Trigger on PR events with specific actions
      const prActions = config.pr_actions || ['opened', 'synchronize'];
      return payload.action && prActions.includes(payload.action);
    
    case 'analyze_on_merge':
      return payload.action === 'closed' && payload.pull_request?.merged === true;
    
    case 'alert_on_failures':
      return payload.check_run?.conclusion === 'failure' || 
             payload.check_suite?.conclusion === 'failure';
    
    case 'update_metrics':
      return true; // Always update on events
    
    default:
      return true;
  }
}

/**
 * Execute trigger action
 */
async function executeTriggerAction(trigger, repositoryId, payload) {
  // This would integrate with the GitHub service for re-analysis
  // For now, we'll just broadcast an analysis request event
  if (broadcastToClients) {
    const event = {
      type: 'analysis_request',
      data: {
        repositoryId,
        triggerAction: trigger.trigger_action,
        eventType: trigger.event_type,
        payload: sanitizePayload(payload),
        timestamp: new Date().toISOString()
      }
    };
    
    broadcastToClients(repositoryId, event);
  }
}

/**
 * Get webhook events for a repository
 */
async function getWebhookEvents(repositoryId, limit = 50) {
  try {
    const result = await query(
      `SELECT * FROM webhook_events 
       WHERE repository_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [repositoryId, limit]
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get webhook events:', error.message);
    throw error;
  }
}

/**
 * Get webhook statistics
 */
async function getWebhookStats(repositoryId, days = 7) {
  try {
    const result = await query(
      `SELECT 
        event_type,
        COUNT(*) as total,
        SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN signature_valid = false THEN 1 ELSE 0 END) as invalid_signatures,
        MIN(created_at) as first_event,
        MAX(created_at) as last_event
       FROM webhook_events
       WHERE repository_id = $1 
         AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY event_type
       ORDER BY total DESC`,
      [repositoryId, days]
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get webhook stats:', error.message);
    throw error;
  }
}

/**
 * Delete webhook configuration
 */
async function deleteWebhookConfig(repositoryId) {
  try {
    await query(
      'UPDATE webhook_configs SET is_active = false WHERE repository_id = $1',
      [repositoryId]
    );
    return true;
  } catch (error) {
    logger.error('Failed to delete webhook config:', error.message);
    throw error;
  }
}

module.exports = {
  createWebhookConfig,
  getWebhookConfig,
  listWebhookConfigs,
  processWebhookEvent,
  registerSubscription,
  unregisterSubscription,
  updateHeartbeat,
  getActiveSubscriptions,
  createEventTrigger,
  getEventTriggers,
  getWebhookEvents,
  getWebhookStats,
  deleteWebhookConfig,
  setBroadcastFunction,
  validateSignature
};

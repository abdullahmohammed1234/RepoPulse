/**
 * Webhook Routes
 * GitHub webhook endpoints and management
 */

const express = require('express');
const router = express.Router();
const webhookService = require('../services/webhookService');
const { query } = require('../config/db');

// GitHub webhook endpoint (POST /api/webhooks/github/:repositoryId)
router.post('/github/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const eventType = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];
    const signature = req.headers['x-hub-signature-256'];
    
    // Validate repository exists
    const repoResult = await query(
      'SELECT id FROM repositories WHERE id = $1',
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Process the webhook event
    const result = await webhookService.processWebhookEvent(
      parseInt(repositoryId),
      eventType,
      req.body,
      deliveryId,
      signature
    );
    
    if (result.success) {
      res.status(200).json({
        message: 'Webhook received',
        eventId: result.eventId,
        processed: result.processed
      });
    } else {
      res.status(400).json({
        error: result.error,
        eventId: result.eventId
      });
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Configure webhook for repository (POST /api/webhooks/config)
router.post('/config', async (req, res) => {
  try {
    let { repositoryId, webhookUrl, events, secret } = req.body;
    
    if (!repositoryId || !webhookUrl) {
      return res.status(400).json({ 
        error: 'repositoryId and webhookUrl are required' 
      });
    }
    
    // Validate repository exists
    const repoResult = await query(
      'SELECT id, name, full_name FROM repositories WHERE id = $1',
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Parse events - could be array or string
    if (typeof events === 'string') {
      try {
        events = JSON.parse(events);
      } catch {
        events = ['push', 'pull_request', 'issues'];
      }
    }
    
    const config = await webhookService.createWebhookConfig(
      repositoryId,
      webhookUrl,
      events || ['push', 'pull_request', 'issues'],
      secret
    );
    
    res.status(201).json({
      message: 'Webhook configured successfully',
      config: {
        id: config.id,
        repositoryId: config.repository_id,
        webhookUrl: config.webhook_url,
        events: config.events,
        isActive: config.is_active
      }
    });
  } catch (error) {
    console.error('Webhook config error:', error);
    res.status(500).json({ error: 'Failed to configure webhook' });
  }
});

// Get webhook configuration (GET /api/webhooks/config/:repositoryId)
router.get('/config/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    const config = await webhookService.getWebhookConfig(parseInt(repositoryId));
    
    if (!config) {
      return res.status(404).json({ error: 'No webhook configured for this repository' });
    }
    
    res.json({
      config: {
        id: config.id,
        repositoryId: config.repository_id,
        webhookUrl: config.webhook_url,
        events: config.events,
        isActive: config.is_active,
        lastDelivered: config.last_delivered_at,
        lastStatus: config.last_status
      }
    });
  } catch (error) {
    console.error('Get webhook config error:', error);
    res.status(500).json({ error: 'Failed to get webhook config' });
  }
});

// List all webhook configurations (GET /api/webhooks/configs)
router.get('/configs', async (req, res) => {
  try {
    const configs = await webhookService.listWebhookConfigs();
    
    res.json({
      configs: configs.map(c => ({
        id: c.id,
        repositoryId: c.repository_id,
        repoName: c.repo_name,
        repoFullName: c.full_name,
        owner: c.owner,
        webhookUrl: c.webhook_url,
        events: c.events,
        isActive: c.is_active,
        lastDelivered: c.last_delivered_at,
        lastStatus: c.last_status
      }))
    });
  } catch (error) {
    console.error('List webhook configs error:', error);
    res.status(500).json({ error: 'Failed to list webhook configs' });
  }
});

// Delete webhook configuration (DELETE /api/webhooks/config/:repositoryId)
router.delete('/config/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    await webhookService.deleteWebhookConfig(parseInt(repositoryId));
    
    res.json({ message: 'Webhook configuration deleted' });
  } catch (error) {
    console.error('Delete webhook config error:', error);
    res.status(500).json({ error: 'Failed to delete webhook config' });
  }
});

// Get webhook events (GET /api/webhooks/events/:repositoryId)
router.get('/events/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { limit = 50 } = req.query;
    
    const events = await webhookService.getWebhookEvents(
      parseInt(repositoryId),
      Math.min(parseInt(limit), 100)
    );
    
    res.json({
      events: events.map(e => ({
        id: e.id,
        eventType: e.event_type,
        eventAction: e.event_action,
        deliveryId: e.delivery_id,
        signatureValid: e.signature_valid,
        processed: e.processed,
        processingError: e.processing_error,
        createdAt: e.created_at,
        processedAt: e.processed_at
      }))
    });
  } catch (error) {
    console.error('Get webhook events error:', error);
    res.status(500).json({ error: 'Failed to get webhook events' });
  }
});

// Get webhook statistics (GET /api/webhooks/stats/:repositoryId)
router.get('/stats/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { days = 7 } = req.query;
    
    const stats = await webhookService.getWebhookStats(
      parseInt(repositoryId),
      parseInt(days)
    );
    
    res.json({
      stats: stats.map(s => ({
        eventType: s.event_type,
        total: parseInt(s.total),
        processed: parseInt(s.processed),
        invalidSignatures: parseInt(s.invalid_signatures),
        firstEvent: s.first_event,
        lastEvent: s.last_event
      }))
    });
  } catch (error) {
    console.error('Get webhook stats error:', error);
    res.status(500).json({ error: 'Failed to get webhook stats' });
  }
});

// Create event trigger (POST /api/webhooks/triggers)
router.post('/triggers', async (req, res) => {
  try {
    const { repositoryId, eventType, triggerAction, config } = req.body;
    
    if (!repositoryId || !eventType || !triggerAction) {
      return res.status(400).json({
        error: 'repositoryId, eventType, and triggerAction are required'
      });
    }
    
    // Validate repository exists
    const repoResult = await query(
      'SELECT id FROM repositories WHERE id = $1',
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    const trigger = await webhookService.createEventTrigger(
      repositoryId,
      eventType,
      triggerAction,
      config || {}
    );
    
    res.status(201).json({
      message: 'Event trigger created',
      trigger: {
        id: trigger.id,
        repositoryId: trigger.repository_id,
        eventType: trigger.event_type,
        triggerAction: trigger.trigger_action,
        config: trigger.config,
        isActive: trigger.is_active,
        lastTriggered: trigger.last_triggered_at,
        triggerCount: trigger.trigger_count
      }
    });
  } catch (error) {
    console.error('Create trigger error:', error);
    res.status(500).json({ error: 'Failed to create event trigger' });
  }
});

// Get event triggers (GET /api/webhooks/triggers/:repositoryId)
router.get('/triggers/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    const triggers = await webhookService.getEventTriggers(parseInt(repositoryId));
    
    res.json({
      triggers: triggers.map(t => ({
        id: t.id,
        repositoryId: t.repository_id,
        eventType: t.event_type,
        triggerAction: t.trigger_action,
        config: t.config,
        isActive: t.is_active,
        lastTriggered: t.last_triggered_at,
        triggerCount: t.trigger_count
      }))
    });
  } catch (error) {
    console.error('Get triggers error:', error);
    res.status(500).json({ error: 'Failed to get event triggers' });
  }
});

// Health check endpoint for webhooks (GET /api/webhooks/health)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'webhooks'
  });
});

module.exports = router;

/**
 * Workflow API Routes
 * Phase 4: Endpoints for workflow management and execution
 */

const express = require('express');
const router = express.Router();
const workflowService = require('../services/workflowService');
const logger = require('../services/logger');

// Ensure logger has methods
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

// ============================================
// Workflow Management Routes
// ============================================

/**
 * GET /api/workflows
 * Get all workflows
 */
router.get('/', async (req, res) => {
  try {
    const includeTemplates = req.query.includeTemplates === 'true';
    const workflows = await workflowService.getWorkflows(includeTemplates);
    res.json({ success: true, workflows });
  } catch (error) {
    logger.error('Failed to get workflows:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/templates
 * Get workflow templates
 */
router.get('/templates', async (req, res) => {
  try {
    const workflows = await workflowService.getWorkflows(true);
    const templates = workflows.filter(w => w.is_template);
    res.json({ success: true, workflows: templates });
  } catch (error) {
    logger.error('Failed to get workflow templates:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id
 * Get workflow by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const workflow = await workflowService.getWorkflowById(req.params.id);
    
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    
    res.json({ success: true, workflow });
  } catch (error) {
    logger.error('Failed to get workflow:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows
 * Create a new workflow
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, category, nodes, edges, entry_node_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Workflow name is required' });
    }
    
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'Workflow must have at least one node' });
    }
    
    const workflow = await workflowService.createWorkflow({
      name,
      description,
      category,
      nodes,
      edges,
      entry_node_id,
      created_by: req.body.userId || null,
      organization_id: req.body.organizationId || null
    });
    
    res.status(201).json({ success: true, workflow });
  } catch (error) {
    logger.error('Failed to create workflow:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/workflows/:id
 * Update workflow
 */
router.put('/:id', async (req, res) => {
  try {
    const workflow = await workflowService.updateWorkflow(req.params.id, req.body);
    
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    
    res.json({ success: true, workflow });
  } catch (error) {
    logger.error('Failed to update workflow:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/workflows/:id
 * Delete workflow
 */
router.delete('/:id', async (req, res) => {
  try {
    await workflowService.deleteWorkflow(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete workflow:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id/stats
 * Get workflow statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await workflowService.getWorkflowStats(req.params.id);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get workflow stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Execution Routes
// ============================================

/**
 * POST /api/workflows/:id/execute
 * Start workflow execution
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { input_data, userId, repositoryId } = req.body;
    
    const execution = await workflowService.startExecution(
      req.params.id,
      input_data || {},
      userId || null,
      repositoryId || null
    );
    
    // Get the workflow definition
    const workflow = await workflowService.getWorkflowById(req.params.id);
    const nodes = typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes;
    const edges = typeof workflow.edges === 'string' ? JSON.parse(workflow.edges) : workflow.edges;
    
    // Execute nodes sequentially (simplified - could be async)
    let currentOutput = input_data || {};
    let currentNodeId = workflow.entry_node_id;
    let failedNode = null;
    
    while (currentNodeId) {
      // Find current node
      const currentNode = nodes.find(n => n.id === currentNodeId);
      
      if (!currentNode) {
        break;
      }
      
      // Get node execution record
      const nodeExecutions = await workflowService.getNodeExecutions(execution.id);
      const nodeExecution = nodeExecutions.find(ne => ne.node_id === currentNodeId);
      
      try {
        // Execute the node
        currentOutput = await workflowService.executeNode(
          nodeExecution.id,
          currentOutput,
          currentNode.type,
          currentNode.config || {}
        );
      } catch (nodeError) {
        // Mark as failed and stop execution
        failedNode = currentNodeId;
        await workflowService.failExecution(execution.id, nodeError.message, currentNodeId);
        break;
      }
      
      // Find next node
      const outgoingEdges = edges.filter(e => e.source === currentNodeId);
      
      if (outgoingEdges.length === 0) {
        break;
      }
      
      // Handle simple case - single edge
      if (outgoingEdges.length === 1) {
        currentNodeId = outgoingEdges[0].target;
      } else {
        // Multiple edges - could have conditions (simplified for now)
        currentNodeId = outgoingEdges[0].target;
      }
    }
    
    // If no failure, complete the execution
    if (!failedNode) {
      await workflowService.completeExecution(execution.id, currentOutput);
    }
    
    // Get updated execution
    const updatedExecution = await workflowService.getExecutionById(execution.id);
    
    res.json({ 
      success: true, 
      execution: updatedExecution,
      output: updatedExecution.output_data ? JSON.parse(updatedExecution.output_data) : null
    });
    
  } catch (error) {
    logger.error('Failed to execute workflow:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id/executions
 * Get workflow executions
 */
router.get('/:id/executions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const executions = await workflowService.getWorkflowExecutions(req.params.id, limit);
    res.json({ success: true, executions });
  } catch (error) {
    logger.error('Failed to get executions:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/executions/:id
 * Get execution by ID
 */
router.get('/executions/:id', async (req, res) => {
  try {
    const execution = await workflowService.getExecutionById(req.params.id);
    
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    
    // Get node executions
    const nodeExecutions = await workflowService.getNodeExecutions(req.params.id);
    
    res.json({ 
      success: true, 
      execution,
      nodeExecutions
    });
  } catch (error) {
    logger.error('Failed to get execution:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/executions
 * Get all executions (for dashboard)
 */
router.get('/executions/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const executions = await workflowService.getAllExecutions(limit);
    res.json({ success: true, executions });
  } catch (error) {
    logger.error('Failed to get all executions:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Initialization Route
// ============================================

/**
 * POST /api/workflows/init
 * Initialize workflow templates
 */
router.post('/init', async (req, res) => {
  try {
    await workflowService.initializeWorkflowTemplates();
    res.json({ success: true, message: 'Workflow templates initialized' });
  } catch (error) {
    logger.error('Failed to initialize templates:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

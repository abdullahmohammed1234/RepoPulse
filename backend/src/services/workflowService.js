/**
 * Workflow Expansion Service
 * Phase 4: Handles workflow definitions, execution, and node processing
 */

const { query, pool } = require('../config/db');
const logger = require('./logger');

// Ensure logger has info method
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.warn = (msg) => console.log('[WARN]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

// Node type definitions
const NODE_TYPES = {
  INPUT: { type: 'input', category: 'source', description: 'Input data source' },
  GENERATE_TASK_LIST: { type: 'generate_task_list', category: 'ai_transform', description: 'Create task list' },
  GENERATE_ACTION_PLAN: { type: 'generate_action_plan', category: 'ai_transform', description: 'Create action plan' },
  GENERATE_CONTENT_CALENDAR: { type: 'generate_content_calendar', category: 'ai_transform', description: 'Create content calendar' },
  GENERATE_EMAIL_SERIES: { type: 'generate_email_series', category: 'ai_transform', description: 'Create email series' },
  GENERATE_DOCUMENT: { type: 'generate_document', category: 'ai_transform', description: 'Generate structured document' },
  FILTER: { type: 'filter', category: 'utility', description: 'Filter content based on criteria' },
  MERGE: { type: 'merge', category: 'utility', description: 'Merge multiple inputs' },
  TRANSFORM: { type: 'transform', category: 'utility', description: 'Transform data format' },
  OUTPUT: { type: 'output', category: 'terminal', description: 'Final output' }
};

// Default workflow templates
const DEFAULT_WORKFLOW_TEMPLATES = [
  {
    name: 'Task List Generator',
    description: 'Convert any content into an actionable task list',
    category: 'productivity',
    is_template: true,
    nodes: [
      { id: 'input', type: 'input', name: 'Input', position: { x: 0, y: 0 } },
      { id: 'generate', type: 'generate_task_list', name: 'Generate Tasks', position: { x: 200, y: 0 }, config: { maxTasks: 10, priorityOrdering: true } },
      { id: 'output', type: 'output', name: 'Output', position: { x: 400, y: 0 } }
    ],
    edges: [
      { source: 'input', target: 'generate' },
      { source: 'generate', target: 'output' }
    ],
    entry_node_id: 'input'
  },
  {
    name: 'Action Plan Builder',
    description: 'Create a structured action plan with milestones',
    category: 'planning',
    is_template: true,
    nodes: [
      { id: 'input', type: 'input', name: 'Input', position: { x: 0, y: 0 } },
      { id: 'generate', type: 'generate_action_plan', name: 'Generate Plan', position: { x: 200, y: 0 }, config: { timelineUnit: 'weeks', includeMilestones: true } },
      { id: 'output', type: 'output', name: 'Output', position: { x: 400, y: 0 } }
    ],
    edges: [
      { source: 'input', target: 'generate' },
      { source: 'generate', target: 'output' }
    ],
    entry_node_id: 'input'
  },
  {
    name: 'Content Calendar Creator',
    description: 'Plan content over a specified time period',
    category: 'marketing',
    is_template: true,
    nodes: [
      { id: 'input', type: 'input', name: 'Input', position: { x: 0, y: 0 } },
      { id: 'generate', type: 'generate_content_calendar', name: 'Generate Calendar', position: { x: 200, y: 0 }, config: { duration: 30, frequency: 'weekly' } },
      { id: 'output', type: 'output', name: 'Output', position: { x: 400, y: 0 } }
    ],
    edges: [
      { source: 'input', target: 'generate' },
      { source: 'generate', target: 'output' }
    ],
    entry_node_id: 'input'
  },
  {
    name: 'Email Series Generator',
    description: 'Create a sequence of marketing emails',
    category: 'marketing',
    is_template: true,
    nodes: [
      { id: 'input', type: 'input', name: 'Input', position: { x: 0, y: 0 } },
      { id: 'generate', type: 'generate_email_series', name: 'Generate Emails', position: { x: 200, y: 0 }, config: { emailCount: 5, tone: 'professional' } },
      { id: 'output', type: 'output', name: 'Output', position: { x: 400, y: 0 } }
    ],
    edges: [
      { source: 'input', target: 'generate' },
      { source: 'generate', target: 'output' }
    ],
    entry_node_id: 'input'
  }
];

/**
 * Initialize default workflow templates
 */
async function initializeWorkflowTemplates() {
  try {
    // Check if templates already exist
    const existing = await query(
      'SELECT COUNT(*) as count FROM workflows WHERE is_template = true'
    );
    
    if (parseInt(existing.rows[0].count) > 0) {
      logger.info('Workflow templates already exist');
      return;
    }
    
    // Insert default templates
    for (const template of DEFAULT_WORKFLOW_TEMPLATES) {
      await query(
        `INSERT INTO workflows (name, description, category, nodes, edges, entry_node_id, is_template, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          template.name,
          template.description,
          template.category,
          JSON.stringify(template.nodes),
          JSON.stringify(template.edges),
          template.entry_node_id,
          template.is_template,
          true
        ]
      );
    }
    
    logger.info('Workflow templates initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize workflow templates:', error.message);
  }
}

/**
 * Get all workflows
 */
async function getWorkflows(includeTemplates = false) {
  let sql = 'SELECT * FROM workflows';
  const params = [];
  
  if (!includeTemplates) {
    sql += ' WHERE is_template = false';
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get workflow by ID
 */
async function getWorkflowById(workflowId) {
  const result = await query(
    'SELECT * FROM workflows WHERE id = $1',
    [workflowId]
  );
  return result.rows[0];
}

/**
 * Create a new workflow
 */
async function createWorkflow(workflowData) {
  const { name, description, category, nodes, edges, entry_node_id, created_by, organization_id } = workflowData;
  
  const result = await query(
    `INSERT INTO workflows (name, description, category, nodes, edges, entry_node_id, created_by, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      description || null,
      category || 'custom',
      JSON.stringify(nodes || []),
      JSON.stringify(edges || []),
      entry_node_id || null,
      created_by || null,
      organization_id || null
    ]
  );
  
  return result.rows[0];
}

/**
 * Update workflow
 */
async function updateWorkflow(workflowId, updates) {
  const { name, description, category, nodes, edges, entry_node_id, is_active } = updates;
  
  const result = await query(
    `UPDATE workflows 
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         nodes = COALESCE($4, nodes),
         edges = COALESCE($5, edges),
         entry_node_id = COALESCE($6, entry_node_id),
         is_active = COALESCE($7, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $8
     RETURNING *`,
    [name, description, category, nodes, edges, entry_node_id, is_active, workflowId]
  );
  
  return result.rows[0];
}

/**
 * Delete workflow
 */
async function deleteWorkflow(workflowId) {
  await query('DELETE FROM workflows WHERE id = $1', [workflowId]);
  return { success: true };
}

/**
 * Start workflow execution
 */
async function startExecution(workflowId, inputData, userId = null, repositoryId = null) {
  const workflow = await getWorkflowById(workflowId);
  
  if (!workflow) {
    throw new Error('Workflow not found');
  }
  
  // Create execution record
  const executionResult = await query(
    `INSERT INTO workflow_executions (workflow_id, status, input_data, user_id, repository_id, started_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     RETURNING *`,
    [workflowId, 'running', JSON.stringify(inputData), userId, repositoryId]
  );
  
  const execution = executionResult.rows[0];
  
  // Initialize node executions
  const nodes = typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes;
  for (const node of nodes) {
    await query(
      `INSERT INTO node_executions (execution_id, node_id, node_type, node_name, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [execution.id, node.id, node.type, node.name]
    );
  }
  
  // Increment workflow execution count
  await query(
    'UPDATE workflows SET execution_count = execution_count + 1 WHERE id = $1',
    [workflowId]
  );
  
  return execution;
}

/**
 * Get execution by ID
 */
async function getExecutionById(executionId) {
  const result = await query(
    'SELECT * FROM workflow_executions WHERE id = $1',
    [executionId]
  );
  return result.rows[0];
}

/**
 * Get executions for a workflow
 */
async function getWorkflowExecutions(workflowId, limit = 20) {
  const result = await query(
    `SELECT * FROM workflow_executions 
     WHERE workflow_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [workflowId, limit]
  );
  return result.rows;
}

/**
 * Update node execution status
 */
async function updateNodeExecution(nodeExecutionId, updates) {
  const { status, input_data, output_data, error_message, started_at, completed_at } = updates;
  
  const result = await query(
    `UPDATE node_executions
     SET status = COALESCE($1, status),
         input_data = COALESCE($2, input_data),
         output_data = COALESCE($3, output_data),
         error_message = COALESCE($4, error_message),
         started_at = COALESCE($5, started_at),
         completed_at = COALESCE($6, completed_at),
         duration_ms = CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                           THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 
                           ELSE duration_ms END
     WHERE id = $7
     RETURNING *`,
    [status, input_data, output_data, error_message, started_at, completed_at, nodeExecutionId]
  );
  
  return result.rows[0];
}

/**
 * Complete execution
 */
async function completeExecution(executionId, outputData) {
  await query(
    `UPDATE workflow_executions
     SET status = 'completed',
         output_data = $1,
         completed_at = CURRENT_TIMESTAMP,
         duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000
     WHERE id = $2`,
    [JSON.stringify(outputData), executionId]
  );
  
  // Update workflow success count
  const execution = await getExecutionById(executionId);
  await query(
    'UPDATE workflows SET success_count = success_count + 1 WHERE id = $1',
    [execution.workflow_id]
  );
  
  return { success: true };
}

/**
 * Fail execution
 */
async function failExecution(executionId, errorMessage, errorNodeId = null) {
  await query(
    `UPDATE workflow_executions
     SET status = 'failed',
         error_message = $1,
         error_node_id = $2,
         completed_at = CURRENT_TIMESTAMP,
         duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000
     WHERE id = $3`,
    [errorMessage, errorNodeId, executionId]
  );
  
  // Update workflow failure count
  const execution = await getExecutionById(executionId);
  await query(
    'UPDATE workflows SET failure_count = failure_count + 1 WHERE id = $1',
    [execution.workflow_id]
  );
  
  return { success: true };
}

/**
 * Get all node executions for an execution
 */
async function getNodeExecutions(executionId) {
  const result = await query(
    `SELECT * FROM node_executions 
     WHERE execution_id = $1 
     ORDER BY created_at ASC`,
    [executionId]
  );
  return result.rows;
}

/**
 * Execute a node (placeholder for AI processing)
 */
async function executeNode(nodeExecutionId, input, nodeType, nodeConfig = {}) {
  const startedAt = new Date();
  
  // Update status to running
  await updateNodeExecution(nodeExecutionId, {
    status: 'running',
    input_data: JSON.stringify(input),
    started_at: startedAt
  });
  
  try {
    let output;
    
    // Route to appropriate handler based on node type
    switch (nodeType) {
      case 'input':
        output = input;
        break;
        
      case 'generate_task_list':
        output = await generateTaskList(input, nodeConfig);
        break;
        
      case 'generate_action_plan':
        output = await generateActionPlan(input, nodeConfig);
        break;
        
      case 'generate_content_calendar':
        output = await generateContentCalendar(input, nodeConfig);
        break;
        
      case 'generate_email_series':
        output = await generateEmailSeries(input, nodeConfig);
        break;
        
      case 'generate_document':
        output = await generateDocument(input, nodeConfig);
        break;
        
      case 'filter':
        output = await filterContent(input, nodeConfig);
        break;
        
      case 'merge':
        output = await mergeContent(input);
        break;
        
      case 'transform':
        output = await transformContent(input, nodeConfig);
        break;
        
      case 'output':
        output = input;
        break;
        
      default:
        output = { error: `Unknown node type: ${nodeType}` };
    }
    
    const completedAt = new Date();
    
    // Update status to completed
    await updateNodeExecution(nodeExecutionId, {
      status: 'completed',
      output_data: JSON.stringify(output),
      completed_at: completedAt
    });
    
    return output;
    
  } catch (error) {
    const completedAt = new Date();
    
    // Update status to failed
    await updateNodeExecution(nodeExecutionId, {
      status: 'failed',
      error_message: error.message,
      completed_at: completedAt
    });
    
    throw error;
  }
}

// AI Generation functions (simplified - would integrate with actual AI service)
async function generateTaskList(input, config) {
  const maxTasks = config.maxTasks || 10;
  
  // Generate tasks from input content
  const tasks = [
    { id: 1, title: 'Analyze input content', priority: 'high', estimatedEffort: '1 hour' },
    { id: 2, title: 'Create task breakdown', priority: 'high', estimatedEffort: '2 hours' },
    { id: 3, title: 'Prioritize items', priority: 'medium', estimatedEffort: '30 minutes' },
    { id: 4, title: 'Assign resources', priority: 'medium', estimatedEffort: '1 hour' },
    { id: 5, title: 'Set milestones', priority: 'low', estimatedEffort: '30 minutes' }
  ].slice(0, maxTasks);
  
  return {
    tasks,
    summary: `Generated ${tasks.length} tasks from input`,
    totalEstimatedEffort: tasks.reduce((acc, t) => acc + parseEffort(t.estimatedEffort), 0)
  };
}

async function generateActionPlan(input, config) {
  const timelineUnit = config.timelineUnit || 'weeks';
  
  return {
    phases: [
      { name: 'Phase 1: Discovery', duration: `1 ${timelineUnit}`, milestones: ['Requirements gathered', 'Stakeholders aligned'] },
      { name: 'Phase 2: Planning', duration: `2 ${timelineUnit}`, milestones: ['Plan approved', 'Resources allocated'] },
      { name: 'Phase 3: Execution', duration: `4 ${timelineUnit}`, milestones: ['First deliverable', 'Testing complete'] },
      { name: 'Phase 4: Delivery', duration: `1 ${timelineUnit}`, milestones: ['Launch', 'Documentation complete'] }
    ],
    riskAssessment: {
      level: 'medium',
      mitigation: 'Regular status checks and adaptability planning'
    },
    summary: `Created ${timelineUnit}-based action plan`
  };
}

async function generateContentCalendar(input, config) {
  const duration = config.duration || 30;
  const frequency = config.frequency || 'weekly';
  
  const entries = [];
  const weeks = Math.ceil(duration / 7);
  
  for (let i = 0; i < weeks; i++) {
    entries.push({
      week: i + 1,
      topics: [`Topic ${i + 1}A`, `Topic ${i + 1}B`],
      format: 'blog post',
      scheduledDate: new Date(Date.now() + i * 7 * 24 * 60 * 60 * 1000).toISOString()
    });
  }
  
  return {
    entries,
    duration,
    frequency,
    summary: `Generated ${weeks}-week content calendar`
  };
}

async function generateEmailSeries(input, config) {
  const emailCount = config.emailCount || 5;
  const tone = config.tone || 'professional';
  
  const emails = [];
  for (let i = 0; i < emailCount; i++) {
    emails.push({
      sequenceNumber: i + 1,
      subject: `Email ${i + 1}: ${tone === 'professional' ? 'Important Update' : 'Quick Hello'}`,
      body: `This is email ${i + 1} in the series.`,
      callToAction: i < emailCount - 1 ? 'Click here to learn more' : 'Sign up now',
      tone
    });
  }
  
  return {
    emails,
    summary: `Generated ${emailCount}-email ${tone} series`
  };
}

async function generateDocument(input, config) {
  return {
    title: 'Generated Document',
    sections: [
      { heading: 'Introduction', content: 'This document outlines...' },
      { heading: 'Main Content', content: 'Key details and analysis...' },
      { heading: 'Conclusion', content: 'Summary and next steps...' }
    ],
    metadata: {
      generatedAt: new Date().toISOString(),
      format: 'structured'
    }
  };
}

async function filterContent(input, config) {
  const criteria = config.criteria || {};
  // Simple filter implementation
  return input;
}

async function mergeContent(inputs) {
  if (Array.isArray(inputs)) {
    return { merged: inputs, count: inputs.length };
  }
  return inputs;
}

async function transformContent(input, config) {
  const format = config.format || 'json';
  // Transform to specified format
  return input;
}

// Helper function to parse effort estimates
function parseEffort(effortStr) {
  const match = effortStr.match(/(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

/**
 * Get workflow statistics
 */
async function getWorkflowStats(workflowId) {
  const result = await query(
    `SELECT 
       COUNT(*) as total_executions,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
       AVG(duration_ms) as avg_duration_ms,
       MAX(created_at) as last_execution
     FROM workflow_executions 
     WHERE workflow_id = $1`,
    [workflowId]
  );
  
  return result.rows[0];
}

/**
 * Get all executions (for dashboard)
 */
async function getAllExecutions(limit = 50) {
  const result = await query(
    `SELECT we.*, w.name as workflow_name, w.category
     FROM workflow_executions we
     JOIN workflows w ON we.workflow_id = w.id
     ORDER BY we.created_at DESC
     LIMIT $1`,
    [limit]
  );
  
  return result.rows;
}

module.exports = {
  NODE_TYPES,
  initializeWorkflowTemplates,
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  startExecution,
  getExecutionById,
  getWorkflowExecutions,
  updateNodeExecution,
  completeExecution,
  failExecution,
  getNodeExecutions,
  executeNode,
  getWorkflowStats,
  getAllExecutions
};

const express = require('express');
const cors = require('cors');
const winston = require('winston');
const axios = require('axios');
const http = require('http');

// Mock MCP Server
class MockMcpServer {
  constructor() {
    this.connected = false;
    this.tools = [
      {
        name: 'get_environments',
        description: 'Get list of environments from Huawei CodeArts',
        parameters: {
          type: 'object',
          properties: {
            offset: { type: 'number', default: 0 },
            limit: { type: 'number', default: 100 }
          }
        }
      },
      {
        name: 'create_environment',
        description: 'Create a new environment in Huawei CodeArts',
        parameters: {
          type: 'object',
          required: ['name', 'resource_type', 'context'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            endpoint_id: { type: 'string' },
            endpoint_name: { type: 'string' },
            environment_category_id: { type: 'string', default: '8dc56cd6c2cf44029181f04025ed173a' },
            resource_type: { type: 'string' },
            context: {
              type: 'object',
              required: ['region', 'cluster_id'],
              properties: {
                region: { type: 'string' },
                cluster_id: { type: 'string' }
              }
            },
            user_type: { type: 'number', default: 0 }
          }
        }
      }
    ];
  }

  on(event, callback) {
    console.log(`\n=== MCP Event: ${event} ===`);
    if (event === 'listening') {
      const address = 'http://localhost:3000';
      console.log(`Emitting 'listening' event with address: ${address}`);
      callback(address);
    }
    console.log('=== End of Event ===\n');
    return this;
  }

  async executeTool(toolName, params) {
    console.log('\n=== MCP Tool Execution ===');
    console.log(`[${new Date().toISOString()}] Tool: ${toolName}`);
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    try {
      if (toolName === 'get_environments') {
        const { offset = 0, limit = 100 } = params;
        console.log(`Fetching ${limit} environments with offset ${offset}`);
        
        const environments = [
          {
            id: 'env-1',
            name: 'Development Environment',
            status: 'RUNNING',
            created_at: new Date().toISOString()
          },
          {
            id: 'env-2',
            name: 'Staging Environment',
            status: 'RUNNING',
            created_at: new Date().toISOString()
          }
        ];
        
        console.log(`Returning ${environments.length} environments`);
        console.log('Environments:', JSON.stringify(environments, null, 2));
        console.log('=== End of Tool Execution ===\n');
        return environments;
      }

      if (toolName === 'create_environment') {
        console.log('Creating new environment with data:', JSON.stringify(params, null, 2));
        
        const newEnv = {
          id: `env-${Math.floor(Math.random() * 1000)}`,
          ...params,
          status: 'CREATING',
          created_at: new Date().toISOString()
        };
        
        console.log('Successfully created environment:', JSON.stringify(newEnv, null, 2));
        console.log('=== End of Tool Execution ===\n');
        return newEnv;
      }

      throw new Error(`Unknown tool: ${toolName}`);
    } catch (error) {
      console.error(`Error in executeTool (${toolName}):`, error);
      throw error;
    }
  }

  listen() {
    this.connected = true;
    console.log('\n=== MCP Server Starting ===');
    console.log(`[${new Date().toISOString()}] Mock MCP Server started`);
    console.log('Listening on port 3000');
    console.log('Available tools:', this.tools.map(t => t.name).join(', '));
    console.log('=== Server Ready ===\n');
    return this;
  }
}

const mcpServer = new MockMcpServer();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const app = express();
app.use(cors());
app.use(express.json({
  strict: true,
}));

// Expose MCP tools as resources for Cascade discovery
app.get('/resources', (req, res) => {
  console. log("in")
  res.json(mcpServer.tools);
});
  verify: (req, res, buf, encoding) => {
    // Defensive: Log if the body is not valid JSON
    const raw = buf.toString(encoding || 'utf8');
    if (!isValidJson(raw)) {
      console.log('Received invalid JSON body:', raw);
      logger.error('Received invalid JSON body:', raw);
    }
  }

// Utility function to check if a string is valid JSON
function isValidJson(str) {
  if (typeof str !== 'string') return false;
  str = str.trim();
  if (!str.startsWith('{') && !str.startsWith('[')) return false;
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}


// Base URL for Huawei CodeArts API
const BASE_URL = 'https://cloudrelease-ext.ap-southeast-3.myhuaweicloud.com/v2/bde6d8b93a2247b382dde46263e7305c';

// Huawei IAM Auth config
const HUAWEI_IAM_URL = 'https://iam.ap-southeast-3.myhuaweicloud.com/v3/auth/tokens';
const HUAWEI_AUTH_BODY = {
  "auth": {
      "identity": {
          "methods": [
              "password"
          ],
          "password": {
              "user": {
                  "domain": {
                      "name": ""
                  },
                  "name": "",
                  "password": ""
              }
          }
      },
      "scope": {
          "domain": {
              "name": "" 
          },
          "project": {
              "name": "ap--3"
          }
      }
  }
}

// Token cache
let huaweiAuthToken = null;
let huaweiAuthTokenFetchedAt = null;

async function getHuaweiAuthToken() {
  const now = Date.now();
  // If token exists and is less than 23.5 hours old, reuse it
  if (huaweiAuthToken && huaweiAuthTokenFetchedAt && (now - huaweiAuthTokenFetchedAt < 23.5 * 60 * 60 * 1000)) {
    return huaweiAuthToken;
  }
  try {
    const resp = await axios.post(HUAWEI_IAM_URL, HUAWEI_AUTH_BODY, {
      headers: { 'Content-Type': 'application/json' }
    });
    const token = resp.headers['x-subject-token'];
    if (!token) throw new Error('No x-subject-token received from Huawei IAM');
    huaweiAuthToken = token;
    huaweiAuthTokenFetchedAt = now;
    return token;
  } catch (err) {
    console.error('Failed to get Huawei x-auth-token:', err);
    throw err;
  }
}

// Get environments
app.get('/environments', async (req, res) => {
  // Defensive: Check if query params are valid JSON if needed (usually not required for GET)

  try {
    const { offset = 0, limit = 100 } = req.query;
    console.log("11111111111111111111111111")
    const token = await getHuaweiAuthToken();
    console.log("22222222222222222222222222")
    const response = await axios.get(`${BASE_URL}/environments`, {
      params: { offset, limit },
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': token
      }
    });
    res.json(response.data);
    console.log("response",response.data)
  } catch (error) {
    console.log('Error fetching environments:', error);
    logger.error('Error fetching environments:', error);
    res.status(500).json({ error: error.message });
    // res.status(200).json({environments: [{
    //     "description": "",
    //     "endpoint_id": "",
    //     "endpoint_name": "",
    //     "environment_category_id": "8dc56cd6c2cf44029181f04025ed173a",
    //     "name": "Environment-20250511114557",
    //     "resource_type": "CCE",
    //     "context": {
    //         "region": "cn-north-7",
    //         "cluster_id": "0ba3272e-d18c-11ef-963b-0255ac100b03"
    //     },
    //     "user_type": 0
    // }]})
  }
});

// Create environment
app.put('/environments', async (req, res) => {
  // Defensive: Check if body is valid JSON and valid JSON-RPC if needed
  let rawBody = JSON.stringify(req.body);
  if (!isValidJson(rawBody)) {
    logger.error('Received invalid JSON input for creating environment:', rawBody);
    return res.status(400).json({ error: 'Invalid JSON input' });
  }
  // Defensive: Check for JSON-RPC structure if you expect JSON-RPC
  // if (
  //   typeof req.body === 'object' &&
  //   (!req.body.jsonrpc || req.body.jsonrpc !== '2.0' || !req.body.method || typeof req.body.id === 'undefined')
  // ) {
  //   logger.error('Received JSON but not valid JSON-RPC for creating environment:', rawBody);
  //   return res.status(400).json({ error: 'Invalid JSON-RPC input' });
  // }

  try {
    const environmentData = req.body;
    console.log('Creating environment with data:', environmentData);
    const token = await getHuaweiAuthToken();
    const response = await axios.put(
      `${BASE_URL}/environments`,
      environmentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    logger.error('Error creating environment:', error);
    console.log('Error creating environment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize Express server

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle MCP server events
mcpServer.on('error', (error) => {
  console.log('MCP Server Error:', error);
  logger.error('MCP Server Error:', error);
});

mcpServer.on('listening', (address) => {
  logger.info(`MCP Server listening on ${address}`);
  console.log(`MCP Server listening on ${address}`);
});

// Start MCP server
mcpServer.listen();

module.exports = app;

// server.mjs
import axios from 'axios';
import winston from 'winston';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpServerTransport } from '@modelcontextprotocol/sdk/server/http.js';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'server-combined.log' })
  ]
});

// Huawei IAM Auth config
const HUAWEI_IAM_URL = 'https://iam.ap-southeast-3.myhuaweicloud.com/v3/auth/tokens';
const HUAWEI_AUTH_BODY = {
  auth: {
    identity: {
      methods: ['password'],
      password: {
        user: {
          domain: { name: 'hwstaff_pub_TRCCloudTeam' },
          name: 'tzivia_rot',
          password: 'Tz214384'
        }
      }
    },
    scope: {
      domain: { name: 'hwstaff_pub_TRCCloudTeam' },
      project: { name: 'ap-southeast-3' }
    }
  }
};

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
    logger.error('Failed to get Huawei x-auth-token:', err);
    throw err;
  }
}

// Base URL for Huawei CodeArts
const BASE_URL = 'https://cloudrelease-ext.ap-southeast-3.myhuaweicloud.com/v2/bde6d8b93a2247b382dde46263e7305c';

// Define tools
const tools = [
  {
    name: 'get_environments',
    description: 'Get list of environments from Huawei CodeArts',
    parameters: {
      type: 'object',
      properties: {
        offset: { type: 'number', default: 0 },
        limit: { type: 'number', default: 100 }
      }
    },
    async execute(params) {
      try {
        const { offset = 0, limit = 100 } = params;
        const token = await getHuaweiAuthToken();
        const response = await axios.get(`${BASE_URL}/environments`, {
          params: { offset, limit },
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': token
          }
        });
        return response.data;
      } catch (error) {
        logger.error('Error fetching environments:', error);
        return { error: error.message };
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
    },
    async execute(params) {
      try {
        const token = await getHuaweiAuthToken();
        const response = await axios.post(`${BASE_URL}/environments`, params, {
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': token
          }
        });
        return response.data;
      } catch (error) {
        logger.error('Error creating environment:', error);
        return { error: error.message };
      }
    }
  },
  {
    name: 'get_gitops_runtime',
    description: 'Get GitOps runtime by resource type and resource id',
    parameters: {
      type: 'object',
      required: ['environment_id', 'resource_id', 'resource_type'],
      properties: {
        environment_id: { type: 'string' },
        resource_id: { type: 'string' },
        resource_type: { type: 'string' }
      }
    },
    async execute(params) {
      logger.info('Getting GitOps runtime with params:', params);
      // Example logic, replace with actual API call if needed
      return {
        environment_id: params.environment_id,
        resource_id: params.resource_id,
        resource_type: params.resource_type,
        runtime: 'mock-runtime',
        timestamp: new Date().toISOString()
      };
    }
  }
];

// Create and configure the MCP server
const server = new McpServer({
  name: 'Huawei CodeArts MCP Server',
  version: '1.0.0'
});

// Add tools to the server
tools.forEach(tool => {
  server.tool(tool.name, tool.parameters, tool.execute);
});

// Create the HTTP transport on port 3000
const httpTransport = new HttpServerTransport({ port: 3000 });

// Connect the server to the HTTP transport
await server.connect(httpTransport);

logger.info('MCP server is now running on http://localhost:3000');

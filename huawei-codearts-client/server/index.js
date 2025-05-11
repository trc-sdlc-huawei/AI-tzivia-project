import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';

class McpClient {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl || 'http://localhost:3000';
    this.connected = false;
    this.tools = [];
  }

  async connect() {
    try {
      // Optionally check server health or fetch tools
      await this.listTools();
      this.connected = true;
      console.log('[McpClient] Connected to MCP server (listTools succeeded)');
      return { success: true };
    } catch (err) {
      // Fallback: allow connection even if listTools fails
      this.connected = true;
      console.warn('[McpClient] listTools failed, but setting connected = true for fallback. Error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async listTools() {
    try {
      // Assume MCP server exposes /tools endpoint or similar
      const resp = await axios.get(`${this.baseUrl}/resources`);
      this.tools = resp.data.tools || [];
      return this.tools;
    } catch (err) {
      throw new Error('Failed to list MCP tools: ' + (err.response?.data?.message || err.message));
    }
  }

  async executeTool(toolName, params) {
    try {
      // Map toolName to endpoint (example: get_environments -> /environments)
      let endpoint = '';
      let method = 'post';
      switch(toolName) {
        case 'get_environments':
          endpoint = '/environments';
          method = 'get';
          break;
        case 'create_environment':
          endpoint = '/environments';
          method = 'put'; // Changed from 'post' to 'put' to match MCP server
          break;
        case 'create_loop':
          endpoint = '/loops'; // Adjust if your MCP server uses a different path
          method = 'post';
          break;
        case 'run_code':
          endpoint = '/run'; // Adjust as needed
          method = 'post';
          break;
        default:
          throw new Error('Unknown tool: ' + toolName);
      }
      let resp;
      if (method === 'get') {
        resp = await axios.get(`${this.baseUrl}${endpoint}`, { params });
      } else 
      if (method === 'put') {
        resp = await axios.put(`${this.baseUrl}${endpoint}`, params);
      }
      return resp.data;
    } catch (err) {
      // Defensive: Handle JSON and connection errors
      return { status: 'error', message: err.response?.data?.message || err.message };
    }
  }
}

const mcpClient = new McpClient({ baseUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000' });

import OpenAI from 'openai';
import winston from 'winston';

// Load environment variables
dotenv.config();

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

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure CORS
const corsOptions = {
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Initialize Socket.IO
const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io/'
});

// Initialize OpenAI
let openai;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    logger.info('OpenAI client initialized successfully');
    console.log('OpenAI client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize OpenAI client:', error);
    console.log('Failed to initialize OpenAI client:', error);
    openai = null;
  }
} else {
  logger.warn('OpenAI API key not found in environment variables');
  console.log('OpenAI API key not found in environment variables');
  openai = null;
}

// Optionally test MCP server connection on startup
mcpClient.connect()
  .then(() => {
    logger.info('Successfully connected to MCP server');
    console.log('Successfully connected to MCP server');

    // Move Socket.IO connection handler here
    io.on('connection', (socket) => {
      logger.info('New client connected');
      console.log('New client connected');

      // Handle chat message
      socket.on('sendMessage', async (message, callback) => {
        try {
          // Emit the user's message back to the client
          io.emit('message', {
            sender: 'user',
            text: message,
            timestamp: new Date().toISOString()
          });

          let aiResponse = null;
          let mcpResult = null;
          let mcpError = null;
          let toolName = null;
          let toolParams = null;
          let shouldRunTool = false;

          let intentJson = null;
          if (openai) {
            // Ask OpenAI to extract tool intent and params
            const toolDetectionPrompt = `You are an assistant for a system that can run the following MCP tools: create_environment, get_environments, create_loop, run_code.
Given a user message, respond with a JSON object:
{"tool": <tool_name or null>, "params": <object or null>}
If the message is a request to use a tool, fill in tool and params; otherwise, both should be null.

User message: "${message}"`;
            try {
              const intentResult = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                  { role: 'system', content: 'You are a tool intent extraction assistant.' },
                  { role: 'user', content: toolDetectionPrompt }
                ],
                temperature: 0
              });
              intentJson = intentResult.choices[0].message.content;
              logger.info('OpenAI tool intent extraction raw output:', intentJson);
              console.log('OpenAI tool intent extraction raw output:', intentJson);
              // Defensive: parse JSON safely
              try {
                const parsed = JSON.parse(intentJson);
                logger.info('Parsed tool intent:', parsed);
                console.log('Parsed tool intent:', parsed);
                if (parsed.tool && typeof parsed.tool === 'string') {
                  toolName = parsed.tool.trim(); // Normalize toolName
                  toolParams = parsed.params || {};
                  shouldRunTool = true;
                  console.log('After parsing: shouldRunTool:', shouldRunTool, 'toolName:', toolName, 'toolParams:', toolParams);
                }
              } catch (err) {
                logger.warn('Intent extraction returned invalid JSON:', intentJson);
                console.log('Intent extraction returned invalid JSON:', intentJson);
                shouldRunTool = false;
              }
            } catch (err) {
              logger.error('Error extracting tool intent:', err);
              console.log('Error extracting tool intent:', err);
              shouldRunTool = false;
            }
          }

          console.log('Before tool execution: shouldRunTool:', shouldRunTool, 'toolName:', toolName, 'mcpClient.connected:', mcpClient.connected);
          // Tool parameter schemas
          const TOOL_SCHEMAS = {
            create_environment: {
              required: ['name', 'resource_type', 'context'],
              descriptions: {
                name: 'The name of the environment',
                resource_type: 'The type of resource (e.g., CCE)',
                context: 'Context object with region, cluster_id, etc.'
              }
            },
            get_environments: {
              required: [],
              descriptions: {}
            },
            create_loop: {
              required: ['loop_name', 'parameters'],
              descriptions: {
                loop_name: 'The name of the loop',
                parameters: 'Parameters for the loop'
              }
            },
            run_code: {
              required: ['code'],
              descriptions: {
                code: 'The code to run'
              }
            }
          };

          if (shouldRunTool && mcpClient && mcpClient.connected) {
            const missingParams = TOOL_SCHEMAS[toolName].required.filter(param => !toolParams[param]);
            if (missingParams.length > 0) {
              const missingParamsMessage = `Missing required parameters for tool ${toolName}: ${missingParams.join(', ')}`;
              logger.info(missingParamsMessage);
              console.log(missingParamsMessage);
              io.emit('message', {
                sender: 'ai',
                text: missingParamsMessage,
                timestamp: new Date().toISOString()
              });
              shouldRunTool = false;
            }
          }

          if (shouldRunTool && mcpClient && mcpClient.connected) {
            logger.info(`Invoking MCP tool: ${toolName} with params: ${JSON.stringify(toolParams)}`);
            console.log(`Invoking MCP tool: ${toolName} with params:`, toolParams);
            try {
              mcpResult = await mcpClient.executeTool(toolName, toolParams);
            } catch (err) {
              mcpError = `Error executing tool: ${err.message}`;
            }

            // Instead of sending raw tool result to user, send it to LLM for post-processing
            if (openai) {
              const llmPrompt = `User message: "${message}"
Tool used: ${toolName}
Tool result (JSON): ${JSON.stringify(mcpResult)}
\nBased on the user's original request and the tool result, provide the most helpful, concise response. If the user asked for a summary or count, do that instead of just repeating the tool output.`;
              try {
                const completion = await openai.chat.completions.create({
                  model: 'gpt-3.5-turbo',
                  messages: [
                    { role: 'system', content: 'You are a helpful assistant that can use tool results to answer user questions.' },
                    { role: 'user', content: llmPrompt }
                  ],
                  temperature: 0.7,
                });
                aiResponse = completion.choices[0].message.content;
                io.emit('message', {
                  sender: 'ai',
                  text: aiResponse,
                  timestamp: new Date().toISOString()
                });
              } catch (llmError) {
                logger.error('Error in LLM post-processing of tool result:', llmError);
                io.emit('message', {
                  sender: 'ai',
                  text: mcpError ? `MCP Error: ${mcpError}` : `MCP Tool Result: ${JSON.stringify(mcpResult, null, 2)}`,
                  timestamp: new Date().toISOString()
                });
              }
            } else {
              io.emit('message', {
                sender: 'ai',
                text: mcpError ? `MCP Error: ${mcpError}` : `MCP Tool Result: ${JSON.stringify(mcpResult, null, 2)}`,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            if (!shouldRunTool) {
              logger.info('No MCP tool detected for message. Forwarding to LLM.');
              console.log('No MCP tool detected for message. Forwarding to LLM.');
            }

            try {
              // Get response from OpenAI
              if (openai) {
                const completion = await openai.chat.completions.create({
                  model: 'gpt-3.5-turbo',
                  messages: [
                    {
                      role: 'system',
                      content: 'You are a helpful assistant integrated with Huawei CodeArts MCP server. ' +
                              'You help users with questions about Huawei Cloud services, cloud computing, ' +
                              'and related technologies. Be concise and helpful.'
                    },
                    { role: 'user', content: message }
                  ],
                  temperature: 0.7,
                });
                aiResponse = completion.choices[0].message.content;
              } else {
                aiResponse = "I'm currently unable to process your request (OpenAI service not configured). " +
                            "Please set up your OpenAI API key in the .env file.";
              }
            } catch (error) {
              logger.error('Error getting response from OpenAI:', error);
              console.log('Error getting response from OpenAI:', error);
              aiResponse = "I'm sorry, I encountered an error processing your request. Please check the logs for more details.";
            }
            io.emit('message', {
              sender: 'ai',
              text: aiResponse,
              timestamp: new Date().toISOString()
            });
          }
          if (callback) callback({ status: 'Message sent' });
        } catch (error) {
          console.log('Error processing message:', error);
          logger.error('Error processing message:', error);
          console.log('Error processing message:', error);
          io.emit('error', { message: 'Error processing your message' });
          if (callback) callback({ status: 'Error', error: error.message });
        }
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected');
        console.log('Client disconnected');
      });
    });
  })
  .catch((err) => {
    logger.error('Failed to connect to MCP server:', err);
    console.log('Failed to connect to MCP server:', err);
  });

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('../client'));

// Serve static files from the client directory
const clientPath = path.join(process.cwd(), 'client');
app.use(express.static(clientPath));

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
// (Moved inside mcpClient.connect().then(...))

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = 3001; // Force port 3001 to avoid conflicts
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});

export default server;

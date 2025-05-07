import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// MCP Client will be implemented later
class MockMcpClient {
  constructor() {
    this.connected = false;
  }
  
  async connect() {
    this.connected = true;
    return { success: true };
  }
  
  async executeTool(toolName, params) {
    console.log(`[MOCK] Executing tool: ${toolName}`, params);
    return { status: 'success', message: 'Mock MCP response' };
  }
}

const McpClient = MockMcpClient;
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
  } catch (error) {
    logger.error('Failed to initialize OpenAI client:', error);
    openai = null;
  }
} else {
  logger.warn('OpenAI API key not found in environment variables');
  openai = null;
}

// Initialize MCP client
let mcpClient;
if (process.env.MCP_SERVER_URL) {
  try {
    logger.info(`Initializing MCP client with server URL: ${process.env.MCP_SERVER_URL}`);
    mcpClient = new McpClient({
      serverUrl: process.env.MCP_SERVER_URL,
      name: 'huawei-codearts-chatbot',
      version: '1.0.0'
    });
    
    // Test MCP server connection
    logger.info('Testing MCP server connection...');
    mcpClient.connect()
      .then(() => {
        logger.info('Successfully connected to MCP server');
        // Test getting environments
        return mcpClient.executeTool('get_environments', { limit: 1 });
      })
      .then(result => {
        logger.info('MCP server test successful. Sample environment data:', JSON.stringify(result, null, 2));
      })
      .catch(error => {
        logger.error('MCP server connection test failed:', error);
      });
  } catch (error) {
    logger.error('Failed to initialize MCP client:', error);
  }
} else {
  logger.warn('MCP_SERVER_URL not set. MCP integration will be disabled.');
}

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
io.on('connection', (socket) => {
  logger.info('New client connected');

  // Handle chat message
  socket.on('sendMessage', async (message, callback) => {
    try {
      // Emit the user's message back to the client
      io.emit('message', { 
        sender: 'user', 
        text: message,
        timestamp: new Date().toISOString()
      });

      let aiResponse;
      
      if (openai) {
        try {
          // Get response from OpenAI
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
        } catch (error) {
          logger.error('Error getting response from OpenAI:', error);
          aiResponse = "I'm sorry, I encountered an error processing your request. Please check the logs for more details.";
        }
      } else {
        // Fallback response if OpenAI is not available
        aiResponse = "I'm currently unable to process your request (OpenAI service not configured). " +
                    "Please set up your OpenAI API key in the .env file.";
      }
      
      // Emit the AI's response
      io.emit('message', {
        sender: 'ai',
        text: aiResponse,
        timestamp: new Date().toISOString()
      });

      // Interact with MCP server if available
      if (mcpClient && mcpClient.connected) {
        try {
          logger.info('Processing message with MCP tools:', message);
          
          // Example: If message is about getting environments
          if (message.toLowerCase().includes('list') && message.toLowerCase().includes('environment')) {
            const response = await mcpClient.executeTool('get_environments', { limit: 5 });
            logger.info('Environments from MCP:', JSON.stringify(response, null, 2));
            
            // Add environment info to the AI's context
            if (response && response.length > 0) {
              aiResponse += "\n\nHere are some environments I found: " + 
                response.map(env => env.name).join(', ');
            }
          }
          
          // Example: If message is about creating an environment
          if (message.toLowerCase().includes('create') && message.toLowerCase().includes('environment')) {
            // Extract parameters from message (simplified example)
            const envData = {
              name: 'New Environment',
              description: 'Created via chat interface',
              resource_type: 'CCE',
              context: {
                region: 'ap-southeast-3',
                cluster_id: 'default-cluster'
              }
            };
            const response = await mcpClient.executeTool('create_environment', envData);
            logger.info('Created environment:', JSON.stringify(response, null, 2));
            
            if (response && response.id) {
              aiResponse += "\n\nSuccessfully created environment with ID: " + response.id;
            }
          }
        } catch (error) {
          logger.error('Error executing MCP tool:', error);
        }
      }
      
      if (callback) callback({ status: 'Message sent' });
    } catch (error) {
      logger.error('Error processing message:', error);
      io.emit('error', { message: 'Error processing your message' });
      if (callback) callback({ status: 'Error', error: error.message });
    }
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected');
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = 3001; // Force port 3001 to avoid conflicts
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});

export default server;

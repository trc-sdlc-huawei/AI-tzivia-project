#!/usr/bin/env node

const { McpClient } = require('@modelcontextprotocol/client');
const inquirer = require('inquirer');
const winston = require('winston');
const { program } = require('commander');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'client-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'client-combined.log' })
  ]
});

// MCP Server configuration
const MCP_SERVER_URL = 'http://localhost:3000';

// Initialize MCP client
const mcpClient = new McpClient({
  serverUrl: MCP_SERVER_URL,
  name: 'huawei-codearts-client',
  version: '1.0.0'
});

// Command-line interface
program
  .name('huawei-codearts')
  .description('CLI for interacting with Huawei CodeArts MCP Server')
  .version('1.0.0');

// List environments command
program
  .command('list-environments')
  .description('List all environments')
  .option('--offset <number>', 'Offset for pagination', '0')
  .option('--limit <number>', 'Maximum number of items to return', '100')
  .action(async (options) => {
    try {
      console.log('Fetching environments...');
      const result = await mcpClient.executeTool('get_environments', {
        offset: parseInt(options.offset, 10),
        limit: parseInt(options.limit, 10)
      });
      console.log('Environments:', JSON.stringify(result, null, 2));
    } catch (error) {
      logger.error('Error fetching environments:', error);
      console.error('Error:', error.message);
    }
  });

// Create environment command
program
  .command('create-environment')
  .description('Create a new environment')
  .action(async () => {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Environment name:',
          validate: (input) => !!input || 'Name is required'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description (optional):',
          default: ''
        },
        {
          type: 'input',
          name: 'resource_type',
          message: 'Resource type (e.g., CCE):',
          default: 'CCE'
        },
        {
          type: 'input',
          name: 'region',
          message: 'Region (e.g., cn-north-7):',
          default: 'cn-north-7'
        },
        {
          type: 'input',
          name: 'cluster_id',
          message: 'Cluster ID:',
          validate: (input) => !!input || 'Cluster ID is required'
        }
      ]);

      const environmentData = {
        name: answers.name,
        description: answers.description,
        resource_type: answers.resource_type,
        context: {
          region: answers.region,
          cluster_id: answers.cluster_id
        },
        environment_category_id: '8dc56cd6c2cf44029181f04025ed173a',
        user_type: 0
      };

      console.log('Creating environment...');
      const result = await mcpClient.executeTool('create_environment', environmentData);
      console.log('Environment created successfully:', JSON.stringify(result, null, 2));
    } catch (error) {
      logger.error('Error creating environment:', error);
      console.error('Error:', error.message);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

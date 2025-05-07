# Huawei CodeArts MCP Server

This is an MCP (Model Context Protocol) server that provides tools for interacting with the Huawei CodeArts platform, specifically for managing environments.

## Features

- Get a list of environments from Huawei CodeArts
- Create new environments in Huawei CodeArts

## Prerequisites

- Node.js (v14 or later)
- npm (comes with Node.js)

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Before running the server, you may need to configure authentication headers in the `server.js` file if required by the Huawei CodeArts API.

## Running the Server

To start the server in development mode (with auto-reload):

```bash
npm run dev
```

To start the server in production mode:

```bash
npm start
```

The server will be available at `http://localhost:3000` by default.

## API Endpoints

### GET /environments

Get a list of environments.

**Query Parameters:**
- `offset` (number, optional, default: 0) - Offset for pagination
- `limit` (number, optional, default: 100) - Maximum number of items to return

### PUT /environments

Create a new environment.

**Request Body:**
```json
{
  "description": "string",
  "endpoint_id": "string",
  "endpoint_name": "string",
  "environment_category_id": "string",
  "name": "string",
  "resource_type": "string",
  "context": {
    "region": "string",
    "cluster_id": "string"
  },
  "user_type": 0
}
```

## MCP Tools

This server provides the following MCP tools:

1. `get_environments` - Get a list of environments
2. `create_environment` - Create a new environment

## Logging

Logs are stored in the following files:
- `error.log` - Error logs
- `combined.log` - All logs

## License

MIT

# Huawei CodeArts Chat Client

A web-based chat interface for interacting with the Huawei CodeArts MCP Server, powered by OpenAI.

## Features

- Modern, responsive chat interface
- Real-time messaging with WebSocket
- Integration with OpenAI for AI-powered responses
- Easy to deploy and use

## Prerequisites

- Node.js (v16 or later)
- npm (comes with Node.js)
- OpenAI API key
- (Optional) Huawei CodeArts MCP Server running

## Getting Started

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser and navigate to `http://localhost:3001`

## Development

For development with auto-reload:

```bash
npm run dev
```

## Configuration

You can configure the following environment variables in the `.env` file:

- `PORT`: Port to run the server on (default: 3001)
- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `MCP_SERVER_URL`: URL of the Huawei CodeArts MCP Server (optional)

## Architecture

The application consists of:

- **Frontend**: Vanilla JavaScript, HTML, and CSS
- **Backend**: Node.js with Express and Socket.IO
- **AI Integration**: OpenAI API
- **(Optional)**: Huawei CodeArts MCP Server integration

```bash
# List environments
huawei-codearts list-environments

# Create environment
huawei-codearts create-environment
```

## Configuration

The client is pre-configured to connect to `http://localhost:3000`. To change this, modify the `MCP_SERVER_URL` constant in `index.js`.

## Logs

Logs are stored in the following files:
- `client-error.log` - Error logs
- `client-combined.log` - All logs

## License

MIT

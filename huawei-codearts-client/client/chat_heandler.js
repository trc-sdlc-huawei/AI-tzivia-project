import fs from 'fs/promises';
import { Configuration, OpenAIApi } from "openai";
import { McpClient } from "@modelcontextprotocol/sdk/client/mcp.js";
import { HttpClientTransport } from "@modelcontextprotocol/sdk/client/http.js";

const mcpClient = new McpClient();
await mcpClient.connect(new HttpClientTransport({ url: 'http://localhost:3000' }));

const config = new Configuration({ apiKey: 'YOUR_OPENAI_API_KEY' });
const openai = new OpenAIApi(config);

// Load system prompt at startup
const systemPrompt = await fs.readFile('system_prompt.txt', 'utf-8');

export async function chatWithUser(userMessage, chatHistory) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: userMessage }
  ];

  const completion = await openai.createChatCompletion({
    model: "gpt-4",
    messages
  });

  const aiReply = completion.data.choices[0].message.content;

  try {
    const toolRequest = JSON.parse(aiReply);
    if (toolRequest.tool) {
      const result = await mcpClient.tool(toolRequest.tool).call(toolRequest.params);
      messages.push({ role: 'assistant', content: JSON.stringify(result) });

      const followUp = await openai.createChatCompletion({
        model: "gpt-4",
        messages
      });
      return followUp.data.choices[0].message.content;
    }
  } catch (e) {
    // Not a JSON tool request, normal reply
  }

  return aiReply;
}

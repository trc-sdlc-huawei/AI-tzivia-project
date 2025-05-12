import express from 'express';
import path from 'path';
import { chatWithUser } from './chat/chatHandler.mjs';

const __dirname = path.resolve();
const app = express();
const port = 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const chatHistory = [];

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  try {
    const reply = await chatWithUser(message, chatHistory);
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Chat client running at http://localhost:${port}`);
});

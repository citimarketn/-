import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import type {Request, Response} from 'express';
import {GoogleGenAI, type Content} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MODEL = 'gemini-4-hydrogen';
const PORT = Number(process.env.PORT) || 3000;

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your key in Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getErrorDetails(error: unknown): {status: number; message: string} {
  if (error instanceof Error) {
    const anyErr = error as Error & {status?: number; code?: number};
    const status =
      typeof anyErr.status === 'number'
        ? anyErr.status
        : typeof anyErr.code === 'number' && anyErr.code >= 400 && anyErr.code < 600
          ? anyErr.code
          : 500;
    return {status, message: error.message};
  }
  return {status: 500, message: String(error)};
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '10mb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, defaultModel: DEFAULT_MODEL});
  });

  app.post('/api/gemini/generate', async (req: Request, res: Response) => {
    try {
      const {model = DEFAULT_MODEL, contents, config} = req.body as {
        model?: string;
        contents?: unknown;
        config?: Record<string, unknown>;
      };

      if (!contents) {
        res.status(400).json({error: 'Missing required field: contents'});
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model,
        contents: contents as Parameters<
          typeof ai.models.generateContent
        >[0]['contents'],
        config: config as Parameters<
          typeof ai.models.generateContent
        >[0]['config'],
      });

      res.json({
        text: response.text ?? '',
        model,
        usageMetadata: response.usageMetadata ?? null,
      });
    } catch (error: unknown) {
      const {status, message} = getErrorDetails(error);
      res.status(status).json({error: message});
    }
  });

  app.post('/api/gemini/stream', async (req: Request, res: Response) => {
    try {
      const {model = DEFAULT_MODEL, contents, config} = req.body as {
        model?: string;
        contents?: unknown;
        config?: Record<string, unknown>;
      };

      if (!contents) {
        res.status(400).json({error: 'Missing required field: contents'});
        return;
      }

      const ai = getGenAIClient();
      const stream = await ai.models.generateContentStream({
        model,
        contents: contents as Parameters<
          typeof ai.models.generateContentStream
        >[0]['contents'],
        config: config as Parameters<
          typeof ai.models.generateContentStream
        >[0]['config'],
      });

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        const chunkText = chunk.text ?? '';
        if (chunkText) {
          res.write(`data: ${JSON.stringify({text: chunkText})}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: unknown) {
      const {status, message} = getErrorDetails(error);
      if (!res.headersSent) {
        res.status(status).json({error: message});
      } else {
        res.write(`data: ${JSON.stringify({error: message})}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const {
        model = DEFAULT_MODEL,
        message,
        history = [],
        config,
      } = req.body as {
        model?: string;
        message?: string;
        history?: Content[];
        config?: Record<string, unknown>;
      };

      if (!message) {
        res.status(400).json({error: 'Missing required field: message'});
        return;
      }

      const ai = getGenAIClient();
      const chat = ai.chats.create({
        model,
        history,
        config: config as Parameters<typeof ai.chats.create>[0]['config'],
      });

      const response = await chat.sendMessage({message});
      const updatedHistory = await chat.getHistory();

      res.json({
        text: response.text ?? '',
        history: updatedHistory,
      });
    } catch (error: unknown) {
      const {status, message} = getErrorDetails(error);
      res.status(status).json({error: message});
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

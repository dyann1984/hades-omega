// Vercel serverless function — health check
export default function handler(_req: any, res: any) {
  res.status(200).json({
    status:    'ok',
    version:   '0.3.0',
    mode:      'vercel-serverless',
    timestamp: Date.now(),
  })
}

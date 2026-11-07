module.exports = {
  '/api': {
    target: process.env.API_PROXY_TARGET?.trim() || 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('error', (_error, _request, response) => {
        if (!response || response.headersSent || response.writableEnded) {
          return;
        }

        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            statusCode: 503,
            message: 'Backend API is unavailable.',
          }),
        );
      });
    },
  },
};

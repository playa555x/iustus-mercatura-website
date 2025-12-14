# Use Bun image
FROM oven/bun:1 as base
WORKDIR /app

# Copy all files except dev-admin
COPY . .
RUN rm -f dev-admin.css dev-admin.js

# Create necessary directories
RUN mkdir -p database backups logs uploads

# Expose port
EXPOSE 3000

# Start server
CMD ["bun", "run", "server.ts"]

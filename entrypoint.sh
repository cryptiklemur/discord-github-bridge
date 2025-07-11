#!/bin/sh
set -e

npm ci

# Run database migrations
npm run migrate

# Start the app
if [ "$NODE_ENV" = "development" ]; then
  npm run dev
else
  npm start
fi
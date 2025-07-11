#!/bin/sh
set -e

# Run database migrations
npm run migrate

# Start the app
npm start
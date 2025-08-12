#!/bin/bash
set -e

echo "Cloud Foundry PORT: $PORT"
echo "Starting n8n with PORT=$PORT"

# Export N8N_PORT with the actual PORT value
export N8N_PORT=$PORT

# Start n8n
exec tini -- /docker-entrypoint.sh start --tunnel

const { spawn } = require('child_process');
const path = require('path');

// Parse VCAP_SERVICES to get database connection details
let dbConfig = {};
if (process.env.VCAP_SERVICES) {
  const vcapServices = JSON.parse(process.env.VCAP_SERVICES);
  
  // Look for PostgreSQL service
  const postgresService = vcapServices.postgresql || vcapServices['postgresql-db'];
  if (postgresService && postgresService.length > 0) {
    const credentials = postgresService[0].credentials;
    
    // Set n8n database environment variables
    process.env.DB_POSTGRESDB_HOST = credentials.hostname;
    process.env.DB_POSTGRESDB_PORT = credentials.port;
    process.env.DB_POSTGRESDB_DATABASE = credentials.dbname;
    process.env.DB_POSTGRESDB_USER = credentials.username;
    process.env.DB_POSTGRESDB_PASSWORD = credentials.password;
    process.env.DB_POSTGRESDB_SSL = 'true';
    
    console.log('Database configuration loaded from VCAP_SERVICES');
  }
}

// Set the port from Cloud Foundry environment
const port = process.env.PORT || process.env.N8N_PORT || 8080;
process.env.N8N_PORT = port;

// Start n8n
console.log('Starting n8n...');
const n8nProcess = spawn('npx', ['n8n', 'start'], {
  stdio: 'inherit',
  env: process.env
});

n8nProcess.on('close', (code) => {
  console.log(`n8n process exited with code ${code}`);
  process.exit(code);
});

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  n8nProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  n8nProcess.kill('SIGINT');
});

# n8n Workflow Automation on SAP BTP

A complete guide to deploy n8n workflow automation platform on SAP Business Technology Platform (BTP) with persistent PostgreSQL database storage.

## 🚀 Overview

This project deploys the latest version of n8n (v1.106.3) on SAP BTP Cloud Foundry with enterprise-grade features:

- **Latest n8n Features**: Task runners, AI/LangChain integrations, advanced webhook handling
- **Data Persistence**: PostgreSQL database for workflow and execution data
- **Production Ready**: SSL/HTTPS, optimized memory allocation, secure configurations
- **Cloud Native**: Containerized deployment with proper health checks

## 📋 Prerequisites

### 1. SAP BTP Account
- SAP BTP trial or productive account
- Cloud Foundry environment enabled
- Minimum 4GB memory quota available

### 2. Required Tools
```bash
# Install Cloud Foundry CLI
# macOS
brew install cloudfoundry/tap/cf-cli@8

# Windows (using Chocolatey)
choco install cloudfoundry-cli

# Linux
wget -q -O - https://packages.cloudfoundry.org/debian/cli.cloudfoundry.org.key | sudo apt-key add -
echo "deb https://packages.cloudfoundry.org/debian stable main" | sudo tee /etc/apt/sources.list.d/cloudfoundry-cli.list
sudo apt-get update && sudo apt-get install cf8-cli
```

### 3. Docker (Optional - for local testing)
```bash
# macOS
brew install docker

# Windows/Linux
# Download from https://docs.docker.com/get-docker/
```

## 🛠 Setup Instructions

### Step 1: Clone the Repository
```bash
git clone https://github.com/GunaSekhar8554/btpn8n.git
cd btpn8n
```

### Step 2: Configure SAP BTP Access

#### Login to Cloud Foundry
```bash
# Replace with your BTP region endpoint
cf login -a https://api.cf.us10-001.hana.ondemand.com

# Enter your BTP credentials when prompted
# Email: your-email@domain.com
# Password: your-password

# Select your organization and space
```

#### Verify Your Environment
```bash
# Check available services
cf marketplace

# Check memory quota
cf org-users YOUR_ORG_NAME
cf space-users YOUR_SPACE_NAME
```

### Step 3: Create PostgreSQL Database Service

```bash
# Create PostgreSQL service instance
cf create-service postgresql-db trial n8n-db

# Wait for service creation (may take 5-10 minutes)
cf services

# Verify service is created successfully
cf service n8n-db
```

### Step 4: Update Configuration

#### Option A: Use Existing Configuration (Recommended)
The repository includes pre-configured files:
- `manifest-simple.yml` - Main deployment configuration
- `vars.yml` - Environment variables

#### Option B: Customize Configuration
Edit `manifest-simple.yml` to customize:

```yaml
applications:
- name: n8n-workflow-app
  docker:
    image: docker.n8n.io/n8nio/n8n:latest
  memory: 2G  # Adjust based on your quota
  disk_quota: 2G
  instances: 1
  command: "sh -c 'export N8N_PORT=$PORT && export N8N_HOST=0.0.0.0 && export N8N_LISTEN_ADDRESS=0.0.0.0 && n8n start'"
  health-check-type: process
  timeout: 300
  services:
  - n8n-db  # Must match your PostgreSQL service name
  env:
    # Database Configuration
    DB_TYPE: postgresdb
    DB_POSTGRESDB_HOST: YOUR_DB_HOST
    DB_POSTGRESDB_PORT: YOUR_DB_PORT
    DB_POSTGRESDB_DATABASE: YOUR_DB_NAME
    DB_POSTGRESDB_USER: YOUR_DB_USER
    DB_POSTGRESDB_PASSWORD: YOUR_DB_PASSWORD
    DB_POSTGRESDB_SSL_ENABLED: true
    DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED: false
    
    # n8n Configuration
    N8N_PROTOCOL: https
    N8N_DISABLE_UI: false
    NODE_ENV: production
    N8N_LOG_LEVEL: info
    N8N_SECURE_COOKIE: false
    N8N_BASIC_AUTH_ACTIVE: false
    N8N_DEFAULT_BINARY_DATA_MODE: filesystem
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: false
```

### Step 5: Deploy to SAP BTP

```bash
# Deploy the application
cf push -f manifest-simple.yml

# Monitor deployment progress
cf logs n8n-workflow-app --recent
```

### Step 6: Verify Deployment

```bash
# Check application status
cf apps

# Get application details
cf app n8n-workflow-app

# Check service binding
cf env n8n-workflow-app
```

## 🌐 Accessing n8n

Once deployed, access your n8n instance at:
```
https://YOUR_APP_NAME.cfapps.YOUR_REGION.hana.ondemand.com
```

Example: `https://n8n-workflow-app.cfapps.us10-001.hana.ondemand.com`

## 🔧 Configuration Details

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_TYPE` | Database type | `postgresdb` |
| `N8N_PROTOCOL` | Protocol for n8n | `https` |
| `N8N_LOG_LEVEL` | Logging level | `info` |
| `NODE_ENV` | Node environment | `production` |
| `N8N_DISABLE_UI` | Disable web UI | `false` |

### Database Configuration

The PostgreSQL database is automatically configured through service binding. The following environment variables are set automatically:

- `DB_POSTGRESDB_HOST` - Database hostname
- `DB_POSTGRESDB_PORT` - Database port
- `DB_POSTGRESDB_DATABASE` - Database name
- `DB_POSTGRESDB_USER` - Database username
- `DB_POSTGRESDB_PASSWORD` - Database password

## 🐛 Troubleshooting

### Common Issues

#### 1. Application Won't Start
```bash
# Check logs for errors
cf logs n8n-workflow-app --recent

# Common solutions:
# - Verify PostgreSQL service is running: cf service n8n-db
# - Check memory allocation: cf app n8n-workflow-app
# - Restart application: cf restart n8n-workflow-app
```

#### 2. Database Connection Issues
```bash
# Check service binding
cf env n8n-workflow-app

# Verify PostgreSQL credentials
cf service-key n8n-db --create SERVICE_KEY_NAME
cf service-key n8n-db SERVICE_KEY_NAME
```

#### 3. Memory Issues
```bash
# Check memory usage
cf app n8n-workflow-app

# Scale memory if needed
cf scale n8n-workflow-app -m 4G
```

#### 4. SSL/HTTPS Issues
Ensure your manifest includes:
```yaml
env:
  N8N_PROTOCOL: https
  N8N_SECURE_COOKIE: false
  DB_POSTGRESDB_SSL_ENABLED: true
```

### Debugging Commands

```bash
# Real-time logs
cf logs n8n-workflow-app

# Application events
cf events n8n-workflow-app

# Service status
cf services

# Environment variables
cf env n8n-workflow-app

# Application health
cf app n8n-workflow-app
```

## 🔄 Updates and Maintenance

### Updating n8n Version

1. **Update the Docker image** in `manifest-simple.yml`:
```yaml
docker:
  image: docker.n8n.io/n8nio/n8n:latest  # or specific version like 1.106.3
```

2. **Deploy the update**:
```bash
cf push -f manifest-simple.yml
```

3. **Verify the update**:
```bash
cf logs n8n-workflow-app --recent | grep "Version:"
```

### Scaling

```bash
# Scale memory
cf scale n8n-workflow-app -m 4G

# Scale instances (if needed)
cf scale n8n-workflow-app -i 2

# Scale disk
cf scale n8n-workflow-app -k 4G
```

### Backup Considerations

Your PostgreSQL database is managed by SAP BTP and includes:
- Automatic backups
- Point-in-time recovery
- High availability

For additional backup strategies, consider:
- Exporting workflows via n8n UI
- Database dumps using PostgreSQL tools
- Version control for workflow definitions

## 📚 Additional Resources

### n8n Documentation
- [Official n8n Documentation](https://docs.n8n.io/)
- [n8n Workflow Examples](https://n8n.io/workflows/)
- [n8n Community Forum](https://community.n8n.io/)

### SAP BTP Resources
- [SAP BTP Documentation](https://help.sap.com/viewer/product/BTP/)
- [Cloud Foundry CLI Documentation](https://docs.cloudfoundry.org/cf-cli/)
- [PostgreSQL on SAP BTP](https://help.sap.com/viewer/product/PostgreSQL/)

### Docker Resources
- [n8n Docker Hub](https://hub.docker.com/r/n8nio/n8n)
- [Official n8n Docker Registry](https://docker.n8n.io/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test the deployment
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter issues:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Review the [SAP BTP documentation](https://help.sap.com/viewer/product/BTP/)
3. Visit the [n8n community forum](https://community.n8n.io/)
4. Create an issue in this repository

## 🏷️ Tags

`n8n` `sap-btp` `cloud-foundry` `workflow-automation` `postgresql` `docker` `enterprise` `no-code` `automation`

---

**Happy Automating! 🚀**
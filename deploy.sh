#!/bin/bash

# Deploy script for Home Assistant Backend
# Author: Michael Lee
# Description: Compresses, uploads, and deploys the backend to remote server

set -e  # Exit on any error

# Configuration
REMOTE_HOST="aliyun-2"
REMOTE_DIR="/app/HomeAssistantBackend"
LOCAL_DIR="."
ARCHIVE_NAME="home-assistant-backend-$(date +%Y%m%d-%H%M%S).zip"
TEMP_DIR="/tmp/ha-backend-deploy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting deployment process...${NC}"

# Step 1: Create temporary directory and prepare files
echo -e "${YELLOW}📦 Preparing files for deployment...${NC}"
rm -rf $TEMP_DIR
mkdir -p $TEMP_DIR

# Copy files excluding unnecessary directories and files
rsync -av --exclude='node_modules' \
         --exclude='.git' \
         --exclude='logs' \
         --exclude='*.log' \
         --exclude='.claude_code_rules.md' \
         --exclude='.claude' \
         --exclude='.gitignore' \
         --exclude='deploy.sh' \
         --exclude='README.md' \
         --exclude='scripts'\
         --exclude='.DS_Store' \
         $LOCAL_DIR/ $TEMP_DIR/

# Step 2: Create zip archive
echo -e "${YELLOW}🗜️  Creating archive: $ARCHIVE_NAME${NC}"
cd $TEMP_DIR
zip -r ../$ARCHIVE_NAME . > /dev/null
cd - > /dev/null

echo -e "${GREEN}✅ Archive created: /tmp/$ARCHIVE_NAME${NC}"

# Step 3: Upload to remote server
echo -e "${YELLOW}📤 Uploading to remote server...${NC}"
scp /tmp/$ARCHIVE_NAME $REMOTE_HOST:/tmp/

echo -e "${GREEN}✅ Upload completed${NC}"

# Step 4: SSH to remote and deploy
echo -e "${YELLOW}🔧 Deploying on remote server...${NC}"
ssh $REMOTE_HOST << 'EOF'
set -e

# Configuration
REMOTE_DIR="/app/HomeAssistantBackend"
ARCHIVE_NAME=$(ls /tmp/home-assistant-backend-*.zip | tail -1)
BACKUP_DIR="/app/HomeAssistantBackend-backup-$(date +%Y%m%d-%H%M%S)"

echo "🔄 Starting remote deployment..."

# Create backup of existing deployment
if [ -d "$REMOTE_DIR" ]; then
    echo "📋 Creating backup: $BACKUP_DIR"
    sudo cp -r $REMOTE_DIR $BACKUP_DIR
    echo "✅ Backup created"
fi

# Create deployment directory
echo "📁 Preparing deployment directory..."
sudo mkdir -p $REMOTE_DIR
cd $REMOTE_DIR

# Stop existing PM2 processes
echo "⏹️  Stopping existing processes..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 stop home-assistant-backend 2>/dev/null || echo "No existing PM2 process found"
    pm2 delete home-assistant-backend 2>/dev/null || echo "No existing PM2 process to delete"
fi

# Extract new files
echo "📦 Extracting new files..."
sudo unzip -o $ARCHIVE_NAME
sudo chown -R $USER:$USER $REMOTE_DIR

# Install dependencies
echo "📥 Installing dependencies..."
npm install --production

# Check if .env exists, if not create template
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found, creating template..."
    cat > .env << 'ENVEOF'
# Server Configuration
PORT=10000
NODE_ENV=production
HOST=0.0.0.0

# Database Configuration
DB_HOST=127.0.0.1
DB_USER=your_db_user
DB_PASSWORD=your_secure_password
DB_NAME=home_assistant
DB_CONNECTION_LIMIT=20
DB_QUEUE_LIMIT=100

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX=5

# Logging
LOG_LEVEL=info
LOG_FORMAT=combined
ENVEOF
    echo "📝 Please edit .env file with your actual configuration"
fi

# Create logs directory
mkdir -p logs

# Start with PM2
echo "🚀 Starting application with PM2..."
npm run pm2:start
pm2 save

# Cleanup
echo "🧹 Cleaning up..."
rm -f $ARCHIVE_NAME

echo "✅ Deployment completed successfully!"
echo "🔍 Check status with: pm2 status"
echo "📊 Monitor logs with: pm2 logs home-assistant-backend"
echo "🌐 Health check: curl http://localhost:10000/health"

EOF

# Step 5: Cleanup local files
echo -e "${YELLOW}🧹 Cleaning up local files...${NC}"
rm -rf $TEMP_DIR
rm -f /tmp/$ARCHIVE_NAME

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "   1. SSH to server: ssh $REMOTE_HOST"
echo -e "   2. Configure .env file if needed"
echo -e "   3. Check status: pm2 status"
echo -e "   4. Monitor logs: pm2 logs home-assistant-backend"
echo -e "   5. Health check: curl http://localhost:10000/health"
#!/bin/bash
# setup.sh - Installation and setup script for Nanos Dashboard

# Default configuration
DEFAULT_PORT=3000
DEFAULT_USERNAME="admin"
DEFAULT_PASSWORD=$(openssl rand -base64 12)
INSTALL_DIR=$(pwd)
LOG_FILE="install.log"
AUTO_MODE=true  # Set to true for fully automatic installation
DEFAULT_DOMAIN="hetzner.nanosmanager.uk"  # Default domain
SETUP_SSL=true  # Enable SSL setup by default

# Function for logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Welcome message
log "======================================"
log "Nanos Dashboard Installation Script"
log "======================================"
log ""

# Check if running as root or with sudo
if [ "$(id -u)" -ne 0 ]; then
  log "⚠️  Warning: This script is not running as root, some operations might fail."
  log "   Consider running with sudo if you encounter permission issues."
  sleep 2
fi

# Check for Node.js and npm
if ! command -v node > /dev/null || ! command -v npm > /dev/null; then
  log "📦 Node.js not found. Installing Node.js 18.x..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - >> "$LOG_FILE" 2>&1
  sudo apt-get install -y nodejs >> "$LOG_FILE" 2>&1
  
  # Verify installation
  if ! command -v node > /dev/null; then
    log "❌ Failed to install Node.js. Please install manually and try again."
    exit 1
  fi
  
  log "✅ Node.js installed: $(node -v)"
  log "✅ npm installed: $(npm -v)"
else
  log "✅ Node.js already installed: $(node -v)"
  log "✅ npm already installed: $(npm -v)"
fi

# Install production dependencies
log "📦 Installing dependencies..."
if [ "$NODE_ENV" = "production" ]; then
  npm ci --only=production >> "$LOG_FILE" 2>&1
else
  npm install >> "$LOG_FILE" 2>&1
fi

# Configuration
log "🔧 Setting up configuration..."

# In automatic mode, use defaults without prompting
if [ "$AUTO_MODE" = true ]; then
  port=$DEFAULT_PORT
  username=$DEFAULT_USERNAME
  password=$DEFAULT_PASSWORD
  domain=$DEFAULT_DOMAIN
  origins="http://localhost:$port,http://$domain:$port,https://$domain:$port"
  log "   Using default values:"
  log "   - Port: $port"
  log "   - Username: $username"
  log "   - Password: [generated]"
  log "   - Domain: $domain"
  log "   - Origins: $origins"
else
  # Interactive mode (original behavior)
  log "   (Press Enter to accept default values)"
  read -p "Port number [$DEFAULT_PORT]: " port
  port=${port:-$DEFAULT_PORT}
  read -p "Admin username [$DEFAULT_USERNAME]: " username
  username=${username:-$DEFAULT_USERNAME}
  read -p "Admin password [$DEFAULT_PASSWORD]: " -s password
  echo ""
  password=${password:-$DEFAULT_PASSWORD}
  read -p "Domain name [$DEFAULT_DOMAIN]: " domain
  domain=${domain:-$DEFAULT_DOMAIN}
  read -p "Allowed origins (comma-separated) [http://localhost:$port,http://$domain:$port,https://$domain:$port]: " origins
  origins=${origins:-"http://localhost:$port,http://$domain:$port,https://$domain:$port"}
  read -p "Setup SSL with Let's Encrypt? (y/n) [y]: " setup_ssl_input
  if [[ $setup_ssl_input == "n" || $setup_ssl_input == "N" ]]; then
    SETUP_SSL=false
  fi
fi

# Install Certbot if SSL is enabled
if [ "$SETUP_SSL" = true ]; then
  log "📦 Installing Certbot for SSL..."
  sudo apt-get update >> "$LOG_FILE" 2>&1
  sudo apt-get install -y certbot >> "$LOG_FILE" 2>&1
  
  # Verify installation
  if ! command -v certbot > /dev/null; then
    log "❌ Failed to install Certbot. SSL setup will be skipped."
    SETUP_SSL=false
  else
    log "✅ Certbot installed: $(certbot --version)"
  fi
fi

# Get SSL certificates if enabled
ssl_enabled="false"
ssl_cert_path=""
ssl_key_path=""

if [ "$SETUP_SSL" = true ]; then
  log "🔒 Setting up SSL with Let's Encrypt for $domain..."
  
  # Stop any services that might be using port 80
  sudo systemctl stop nginx 2>/dev/null
  
  # Get certificate
  sudo certbot certonly --standalone --non-interactive --agree-tos --email admin@$domain -d $domain >> "$LOG_FILE" 2>&1
  
  if [ $? -eq 0 ]; then
    ssl_enabled="true"
    ssl_cert_path="/etc/letsencrypt/live/$domain/fullchain.pem"
    ssl_key_path="/etc/letsencrypt/live/$domain/privkey.pem"
    log "✅ SSL certificates obtained successfully!"
  else
    log "❌ Failed to obtain SSL certificates. Check $LOG_FILE for details."
    log "   Continuing without SSL..."
  fi
fi

# Create .env file
log "📝 Creating environment configuration..."
cat > .env << EOL
PORT=$port
ADMIN_USERNAME=$username
ADMIN_PASSWORD=$password
ALLOWED_ORIGINS=$origins
# SSL Configuration
SSL_ENABLED=$ssl_enabled
SSL_CERT_PATH=$ssl_cert_path
SSL_KEY_PATH=$ssl_key_path
EOL

# Build the application
if [ "$NODE_ENV" != "production" ]; then
  log "🏗️  Building application..."
  npm run build >> "$LOG_FILE" 2>&1
  
  if [ $? -ne 0 ]; then
    log "❌ Build failed. Check $LOG_FILE for details."
    exit 1
  fi
fi

# Create systemd service for auto-start
log "🔄 Setting up systemd service..."
SERVICE_FILE="/etc/systemd/system/nanos-dashboard.service"

sudo bash -c "cat > $SERVICE_FILE" << EOL
[Unit]
Description=Nanos Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOL

# Reload systemd, enable and start service
log "🚀 Starting service..."
sudo systemctl daemon-reload >> "$LOG_FILE" 2>&1
sudo systemctl enable nanos-dashboard.service >> "$LOG_FILE" 2>&1
sudo systemctl start nanos-dashboard.service >> "$LOG_FILE" 2>&1

# Check if service started successfully
sleep 2
if sudo systemctl is-active --quiet nanos-dashboard.service; then
  log "✅ Service started successfully!"
else
  log "⚠️  Service may have failed to start. Check status with: sudo systemctl status nanos-dashboard.service"
fi

# Clean up development files if in production
if [ "$NODE_ENV" = "production" ]; then
  log "🧹 Cleaning up development files..."
  rm -rf src/app/.next/cache
  rm -rf node_modules/.cache
fi

# Automatic firewall configuration
if command -v ufw > /dev/null; then
  log "🔥 Configuring firewall..."
  sudo ufw allow $port/tcp >> "$LOG_FILE" 2>&1
  
  # Allow HTTP and HTTPS for Let's Encrypt
  if [ "$SETUP_SSL" = true ]; then
    sudo ufw allow 80/tcp >> "$LOG_FILE" 2>&1
    sudo ufw allow 443/tcp >> "$LOG_FILE" 2>&1
  fi
  
  log "✅ Firewall rules added"
fi

# Set up automatic SSL renewal
if [ "$SETUP_SSL" = true ]; then
  log "🔄 Setting up automatic SSL renewal..."
  
  # Create renewal script
  cat > renew-ssl.sh << EOL
#!/bin/bash
# SSL renewal script

# Stop services using port 80
systemctl stop nginx 2>/dev/null

# Renew certificates
certbot renew --quiet

# Restart services
systemctl start nginx 2>/dev/null
systemctl restart nanos-dashboard.service

echo "SSL certificates renewed at \$(date)"
EOL
  
  chmod +x renew-ssl.sh
  
  # Add to crontab to run twice daily (standard for Let's Encrypt)
  (crontab -l 2>/dev/null; echo "0 0,12 * * * $INSTALL_DIR/renew-ssl.sh >> $INSTALL_DIR/ssl-renewal.log 2>&1") | crontab -
  
  log "✅ Automatic SSL renewal configured"
fi

# Final instructions
log ""
log "======================================"
log "✅ Installation complete!"
if [ "$ssl_enabled" = "true" ]; then
  log "🌐 Dashboard is running at: https://$domain:$port"
else
  log "🌐 Dashboard is running at: http://$domain:$port"
fi
log "👤 Username: $username"
log "🔑 Password: $password"
log ""
log "📝 Important commands:"
log "   - Check service status: sudo systemctl status nanos-dashboard.service"
log "   - Restart service: sudo systemctl restart nanos-dashboard.service"
log "   - View logs: sudo journalctl -u nanos-dashboard.service"
if [ "$ssl_enabled" = "true" ]; then
  log "   - Renew SSL manually: ./renew-ssl.sh"
fi
log "======================================"

# Add cleanup option for future use
cat > cleanup.sh << EOL
#!/bin/bash
# Cleanup script to remove unnecessary development files after deployment

echo "Cleaning up development files..."
rm -rf src/app/.next/cache
rm -rf node_modules/.cache
rm -rf .git
rm -rf .github
rm -rf .vscode
rm -rf tsconfig*.json
rm -rf .eslintrc.json
rm -rf next.config.js

echo "Done! Your installation is now optimized for production."
EOL
chmod +x cleanup.sh

log "✅ Created cleanup.sh script to remove unnecessary files when you're ready."
log "   Run './cleanup.sh' after confirming everything works correctly."

exit 0 
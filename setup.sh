#!/bin/bash
# setup.sh - Installation and setup script for Nanos Dashboard

# Default configuration
DEFAULT_PORT=3000
DEFAULT_USERNAME="admin"
DEFAULT_PASSWORD=$(openssl rand -base64 12)
INSTALL_DIR=$(pwd)
LOG_FILE="install.log"

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
log "   (Press Enter to accept default values)"

read -p "Port number [$DEFAULT_PORT]: " port
port=${port:-$DEFAULT_PORT}

read -p "Admin username [$DEFAULT_USERNAME]: " username
username=${username:-$DEFAULT_USERNAME}

# Replace problematic read -s with stty-based approach
echo -n "Admin password [$DEFAULT_PASSWORD]: "
stty -echo
read password
stty echo
echo # Add a newline after password input
password=${password:-$DEFAULT_PASSWORD}

read -p "Allowed origins (comma-separated) [http://localhost:$port]: " origins
origins=${origins:-"http://localhost:$port"}

# Create .env file
log "📝 Creating environment configuration..."
cat > .env << EOL
PORT=$port
ADMIN_USERNAME=$username
ADMIN_PASSWORD=$password
ALLOWED_ORIGINS=$origins
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
ExecStart=$(which node) dist/server/index.js
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

# Final instructions
log ""
log "======================================"
log "✅ Installation complete!"
log "🌐 Dashboard is running at: http://localhost:$port"
log "👤 Username: $username"
log "🔑 Password: $password"
log ""
log "📝 Important commands:"
log "   - Check service status: sudo systemctl status nanos-dashboard.service"
log "   - Restart service: sudo systemctl restart nanos-dashboard.service"
log "   - View logs: sudo journalctl -u nanos-dashboard.service"
log "======================================"

# Optional: Open firewall port
if command -v ufw > /dev/null; then
  read -p "Would you like to open the port $port in the firewall? (y/n) " open_port
  if [[ $open_port == "y" || $open_port == "Y" ]]; then
    sudo ufw allow $port/tcp >> "$LOG_FILE" 2>&1
    log "🔥 Firewall rule added for port $port"
  fi
fi

# Optional: Configure Nginx if installed
if command -v nginx > /dev/null; then
  read -p "Would you like to set up Nginx as a reverse proxy? (y/n) " setup_nginx
  if [[ $setup_nginx == "y" || $setup_nginx == "Y" ]]; then
    read -p "Enter domain name (e.g., dashboard.example.com): " domain_name
    
    if [ -z "$domain_name" ]; then
      log "⚠️  No domain provided, skipping Nginx setup"
    else
      sudo bash -c "cat > /etc/nginx/sites-available/$domain_name" << EOL
server {
    listen 80;
    server_name $domain_name;

    location / {
        proxy_pass http://localhost:$port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL
      
      sudo ln -s /etc/nginx/sites-available/$domain_name /etc/nginx/sites-enabled/ >> "$LOG_FILE" 2>&1
      sudo nginx -t >> "$LOG_FILE" 2>&1
      
      if [ $? -eq 0 ]; then
        sudo systemctl reload nginx >> "$LOG_FILE" 2>&1
        log "✅ Nginx configured successfully!"
        log "🌐 Dashboard is now available at: http://$domain_name"
        
        # Ask about SSL
        read -p "Would you like to secure with SSL using Let's Encrypt? (y/n) " setup_ssl
        if [[ $setup_ssl == "y" || $setup_ssl == "Y" ]]; then
          if ! command -v certbot > /dev/null; then
            log "📦 Installing Certbot..."
            sudo apt-get update >> "$LOG_FILE" 2>&1
            sudo apt-get install -y certbot python3-certbot-nginx >> "$LOG_FILE" 2>&1
          fi
          
          sudo certbot --nginx -d $domain_name --non-interactive --agree-tos --email admin@$domain_name >> "$LOG_FILE" 2>&1
          
          if [ $? -eq 0 ]; then
            log "🔒 SSL certificate installed successfully!"
            log "🌐 Dashboard is now available at: https://$domain_name"
          else
            log "⚠️  SSL setup failed. Check $LOG_FILE for details."
          fi
        fi
      else
        log "⚠️  Nginx configuration test failed. Check syntax and try again."
      fi
    fi
  fi
fi

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
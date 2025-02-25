#!/bin/bash
# setup.sh - Installation and setup script for Nanos Dashboard

# Default configuration
DEFAULT_PORT=3000
DEFAULT_USERNAME="admin"
DEFAULT_PASSWORD=$(openssl rand -base64 12)
DEFAULT_DOMAIN="hetzner.nanosmanager.uk"
DEFAULT_IP=$(hostname -I | awk '{print $1}')
INSTALL_DIR=$(pwd)
LOG_FILE="install.log"
AUTO_MODE=true  # Set to true for fully automatic installation
SETUP_SSL=true  # Enable SSL setup by default

# Function for logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to display usage
usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "Options:"
  echo "  --domain DOMAIN       Domain name (default: $DEFAULT_DOMAIN)"
  echo "  --ip IP               Server IP address (default: auto-detected)"
  echo "  --port PORT           Port number (default: $DEFAULT_PORT)"
  echo "  --username USERNAME   Admin username (default: $DEFAULT_USERNAME)"
  echo "  --password PASSWORD   Admin password (default: randomly generated)"
  echo "  --ssl BOOL            Enable SSL setup (true/false, default: $SETUP_SSL)"
  echo "  --interactive         Run in interactive mode (default: automatic)"
  echo "  --help                Display this help message"
  echo ""
  echo "Example:"
  echo "  $0 --domain example.com --port 3000 --username admin --password secret --ssl true"
  exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --domain)
      DEFAULT_DOMAIN="$2"
      shift 2
      ;;
    --ip)
      DEFAULT_IP="$2"
      shift 2
      ;;
    --port)
      DEFAULT_PORT="$2"
      shift 2
      ;;
    --username)
      DEFAULT_USERNAME="$2"
      shift 2
      ;;
    --password)
      DEFAULT_PASSWORD="$2"
      shift 2
      ;;
    --ssl)
      if [[ "$2" == "false" || "$2" == "0" ]]; then
        SETUP_SSL=false
      else
        SETUP_SSL=true
      fi
      shift 2
      ;;
    --interactive)
      AUTO_MODE=false
      shift
      ;;
    --help)
      usage
      ;;
    *)
      log "⚠️  Unknown option: $1"
      usage
      ;;
  esac
done

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
  ip=$DEFAULT_IP
  origins="http://localhost:$port,http://$ip:$port,http://$domain:$port,https://$domain:$port"
  log "   Using provided/default values:"
  log "   - Domain: $domain"
  log "   - IP: $ip"
  log "   - Port: $port"
  log "   - Username: $username"
  log "   - Password: [secured]"
  log "   - SSL Enabled: $SETUP_SSL"
  log "   - Origins: $origins"
else
  # Interactive mode
  log "   (Press Enter to accept default values)"
  read -p "Domain name [$DEFAULT_DOMAIN]: " domain
  domain=${domain:-$DEFAULT_DOMAIN}
  read -p "Server IP [$DEFAULT_IP]: " ip
  ip=${ip:-$DEFAULT_IP}
  read -p "Port number [$DEFAULT_PORT]: " port
  port=${port:-$DEFAULT_PORT}
  read -p "Admin username [$DEFAULT_USERNAME]: " username
  username=${username:-$DEFAULT_USERNAME}
  read -p "Admin password [$DEFAULT_PASSWORD]: " -s password
  echo ""
  password=${password:-$DEFAULT_PASSWORD}
  read -p "Allowed origins (comma-separated) [http://localhost:$port,http://$ip:$port,http://$domain:$port,https://$domain:$port]: " origins
  origins=${origins:-"http://localhost:$port,http://$ip:$port,http://$domain:$port,https://$domain:$port"}
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
    
    # Fix permissions for certificate files
    log "🔧 Setting proper permissions for SSL certificates..."
    sudo chmod -R 755 /etc/letsencrypt/live/
    sudo chmod -R 755 /etc/letsencrypt/archive/
    
    # Create symbolic links if needed
    if [ ! -f "$ssl_cert_path" ] || [ ! -f "$ssl_key_path" ]; then
      log "🔄 Creating symbolic links for SSL certificates..."
      sudo mkdir -p "/etc/letsencrypt/live/$domain/"
      
      # Find the actual certificate files
      cert_file=$(find /etc/letsencrypt/archive/ -name "fullchain*.pem" | sort -r | head -n 1)
      key_file=$(find /etc/letsencrypt/archive/ -name "privkey*.pem" | sort -r | head -n 1)
      
      if [ -n "$cert_file" ] && [ -n "$key_file" ]; then
        sudo ln -sf "$cert_file" "$ssl_cert_path"
        sudo ln -sf "$key_file" "$ssl_key_path"
        log "✅ SSL certificate links created successfully!"
      else
        log "❌ Could not find certificate files. Continuing without SSL..."
        ssl_enabled="false"
      fi
    fi
    
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
  log "⚠️  Service may have failed to start. Checking logs..."
  sudo systemctl status nanos-dashboard.service >> "$LOG_FILE" 2>&1
  log "   Check full logs with: sudo journalctl -u nanos-dashboard.service"
  
  # Try to fix common issues
  log "🔧 Attempting to fix common issues..."
  
  # Check if port is already in use
  if netstat -tuln | grep ":$port " > /dev/null; then
    log "⚠️  Port $port is already in use. Stopping conflicting service..."
    sudo fuser -k $port/tcp >> "$LOG_FILE" 2>&1
    sleep 2
    sudo systemctl start nanos-dashboard.service >> "$LOG_FILE" 2>&1
  fi
  
  # Check SSL certificate permissions again
  if [ "$ssl_enabled" = "true" ]; then
    log "🔧 Ensuring SSL certificates are readable..."
    sudo chmod 644 "$ssl_cert_path" "$ssl_key_path" >> "$LOG_FILE" 2>&1
    sudo systemctl restart nanos-dashboard.service >> "$LOG_FILE" 2>&1
  fi
  
  # Check if service started after fixes
  sleep 2
  if sudo systemctl is-active --quiet nanos-dashboard.service; then
    log "✅ Service started successfully after fixes!"
  else
    log "⚠️  Service still not starting. Please check logs for details."
  fi
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

# Fix permissions
chmod -R 755 /etc/letsencrypt/live/
chmod -R 755 /etc/letsencrypt/archive/

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

# Create a health check script
log "🔄 Creating health check script..."
cat > health-check.sh << EOL
#!/bin/bash
# Health check script for Nanos Dashboard

# Check if service is running
if ! systemctl is-active --quiet nanos-dashboard.service; then
  echo "Service is down, restarting..."
  systemctl restart nanos-dashboard.service
  
  # Send notification (customize as needed)
  # mail -s "Nanos Dashboard Restarted" admin@example.com <<< "The service was down and has been restarted at \$(date)"
fi

# Check if port is responding
if ! curl -s http://localhost:$port >/dev/null; then
  echo "Service not responding, restarting..."
  systemctl restart nanos-dashboard.service
  
  # Send notification (customize as needed)
  # mail -s "Nanos Dashboard Restarted" admin@example.com <<< "The service was not responding and has been restarted at \$(date)"
fi

echo "Health check completed at \$(date)"
EOL

chmod +x health-check.sh

# Add health check to crontab
(crontab -l 2>/dev/null; echo "*/15 * * * * $INSTALL_DIR/health-check.sh >> $INSTALL_DIR/health-check.log 2>&1") | crontab -

log "✅ Health check script created and scheduled"

# Create a configuration summary file
log "📝 Creating configuration summary..."
cat > installation-summary.json << EOL
{
  "installation_date": "$(date '+%Y-%m-%d %H:%M:%S')",
  "domain": "$domain",
  "ip": "$ip",
  "port": $port,
  "username": "$username",
  "ssl_enabled": $ssl_enabled,
  "service_name": "nanos-dashboard",
  "install_directory": "$INSTALL_DIR",
  "node_version": "$(node -v)",
  "npm_version": "$(npm -v)"
}
EOL

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
log "   - Run health check manually: ./health-check.sh"
log "   - Fix SSL permissions: sudo ./fix-ssl-permissions.sh $domain"
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
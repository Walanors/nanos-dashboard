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

# Function to show a spinner for long-running processes
spinner() {
  local pid=$1
  local delay=0.1
  local spinstr='|/-\'
  local start_time=$(date +%s)
  
  # Display the spinner while the process is running
  while ps -p $pid > /dev/null; do
    local temp=${spinstr#?}
    printf " [%c] " "$spinstr"
    local spinstr=$temp${spinstr%"$temp"}
    sleep $delay
    printf "\b\b\b\b\b"
    
    # Show elapsed time every 5 seconds
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    if [ $((elapsed % 5)) -eq 0 ]; then
      printf "\rRunning... %ds " $elapsed
    fi
  done
  printf "    \b\b\b\b"
}

# Function to run a command with a spinner
run_with_spinner() {
  local message="$1"
  local command="$2"
  
  log "$message"
  eval "$command" &
  spinner $!
  wait $!
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    log "✅ Command completed successfully."
  else
    log "⚠️  Command exited with code $exit_code."
  fi
  
  return $exit_code
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
# Create a swap file if memory is low (less than 2GB)
MEMORY_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEMORY_MB" -lt 2048 ]; then
  log "   Low memory detected ($MEMORY_MB MB). Setting up swap file..."
  if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    log "   Swap file created and enabled."
  else
    log "   Swap file already exists."
  fi
fi

# Install dependencies with progress feedback
if [ "$NODE_ENV" = "production" ]; then
  log "   Installing production dependencies..."
  (npm ci --only=production --no-fund --no-audit --progress=true 2>&1 | grep -v "timing\|idealTree\|reify" | tee -a "$LOG_FILE") || {
    log "⚠️  npm ci failed, trying with regular npm install..."
    run_with_spinner "   Retrying with npm install..." "npm install --only=production --no-fund --no-audit --progress=true >> '$LOG_FILE' 2>&1"
  }
else
  log "   Installing all dependencies..."
  (npm install --no-fund --no-audit --progress=true 2>&1 | grep -v "timing\|idealTree\|reify" | tee -a "$LOG_FILE") || {
    log "⚠️  npm install failed, trying with --no-optional flag..."
    run_with_spinner "   Retrying with --no-optional flag..." "npm install --no-optional --no-fund --no-audit --progress=true >> '$LOG_FILE' 2>&1"
  }
fi

# Verify installation was successful
if [ ! -d "node_modules" ]; then
  log "❌ Failed to install dependencies. Please check your system resources and try again."
  log "   You can try running 'npm install' manually."
  exit 1
else
  log "✅ Dependencies installed successfully."
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
  run_with_spinner "   Stopping services on port 80..." "systemctl stop nginx 2>/dev/null || true"
  
  # Get certificate
  log "   Requesting certificate from Let's Encrypt..."
  run_with_spinner "   Running certbot..." "certbot certonly --standalone --non-interactive --agree-tos --email admin@$domain -d $domain >> '$LOG_FILE' 2>&1"
  
  if [ $? -eq 0 ]; then
    ssl_enabled="true"
    ssl_cert_path="/etc/letsencrypt/live/$domain/fullchain.pem"
    ssl_key_path="/etc/letsencrypt/live/$domain/privkey.pem"
    
    # Fix permissions for certificate files
    log "🔧 Setting proper permissions for SSL certificates..."
    run_with_spinner "   Updating certificate permissions..." "chmod -R 755 /etc/letsencrypt/live/ /etc/letsencrypt/archive/"
    
    # Create symbolic links if needed
    if [ ! -f "$ssl_cert_path" ] || [ ! -f "$ssl_key_path" ]; then
      log "🔄 Creating symbolic links for SSL certificates..."
      run_with_spinner "   Creating directory structure..." "mkdir -p /etc/letsencrypt/live/$domain/"
      
      # Find the actual certificate files
      cert_file=$(find /etc/letsencrypt/archive/ -name "fullchain*.pem" | sort -r | head -n 1)
      key_file=$(find /etc/letsencrypt/archive/ -name "privkey*.pem" | sort -r | head -n 1)
      
      if [ -n "$cert_file" ] && [ -n "$key_file" ]; then
        run_with_spinner "   Creating certificate symlinks..." "ln -sf '$cert_file' '$ssl_cert_path' && ln -sf '$key_file' '$ssl_key_path'"
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
log "🔨 Building the application (this may take a while)..."
export NODE_OPTIONS="--max-old-space-size=2048"
log "   Setting Node.js memory limit to 2048 MB"

run_with_spinner "   Building with Next.js..." "npx next build >> '$LOG_FILE' 2>&1"

if [ $? -ne 0 ]; then
  log "⚠️  Build failed with 2048 MB memory limit, trying with 4096 MB..."
  export NODE_OPTIONS="--max-old-space-size=4096"
  log "   Increased Node.js memory limit to 4096 MB"
  
  run_with_spinner "   Retrying build with increased memory..." "npx next build >> '$LOG_FILE' 2>&1"
  
  if [ $? -ne 0 ]; then
    log "⚠️  Build failed again. Attempting to install Next.js globally and retry..."
    run_with_spinner "   Installing Next.js globally..." "npm install -g next >> '$LOG_FILE' 2>&1"
    run_with_spinner "   Retrying build with global Next.js..." "next build >> '$LOG_FILE' 2>&1"
    
    if [ $? -ne 0 ]; then
      log "❌ Build failed after multiple attempts. Check the log file at $LOG_FILE for details."
      read -p "   Continue installation without building? (y/n): " continue_without_build
      if [ "$continue_without_build" != "y" ]; then
        log "❌ Installation aborted by user."
        exit 1
      fi
      log "⚠️  Continuing installation without building. You will need to build manually later."
    else
      log "✅ Build completed successfully with global Next.js."
    fi
  else
    log "✅ Build completed successfully with 4096 MB memory limit."
  fi
else
  log "✅ Build completed successfully with 2048 MB memory limit."
fi

# Create systemd service
log "🔧 Creating systemd service..."
cat > /tmp/nanos-dashboard.service << EOF
[Unit]
Description=Nanos Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
Environment="NODE_ENV=production"
Environment="PORT=$port"
Environment="ADMIN_USERNAME=$username"
Environment="ADMIN_PASSWORD=$password"
Environment="ALLOWED_ORIGINS=$origins"
Environment="SSL_ENABLED=$ssl_enabled"
ExecStart=$(which node) server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

run_with_spinner "   Installing service file..." "cp /tmp/nanos-dashboard.service /etc/systemd/system/"
run_with_spinner "   Reloading systemd daemon..." "systemctl daemon-reload"
run_with_spinner "   Enabling nanos-dashboard service..." "systemctl enable nanos-dashboard.service"

# Start the service
log "🚀 Starting nanos-dashboard service..."
run_with_spinner "   Starting service..." "systemctl start nanos-dashboard.service"

# Check if service is running
sleep 2
if systemctl is-active --quiet nanos-dashboard.service; then
  log "✅ Nanos Dashboard service is running!"
else
  log "⚠️  Service may not have started properly. Check status with: systemctl status nanos-dashboard.service"
fi

# Clean up development files if in production
if [ "$NODE_ENV" = "production" ]; then
  log "🧹 Cleaning up development files..."
  run_with_spinner "   Removing cache files..." "rm -rf src/app/.next/cache node_modules/.cache"
fi

# Automatic firewall configuration
if command -v ufw > /dev/null; then
  log "🔥 Configuring firewall..."
  run_with_spinner "   Adding port $port to firewall..." "ufw allow $port/tcp >> '$LOG_FILE' 2>&1"
  
  # Allow HTTP and HTTPS for Let's Encrypt
  if [ "$SETUP_SSL" = true ]; then
    run_with_spinner "   Adding HTTP port to firewall..." "ufw allow 80/tcp >> '$LOG_FILE' 2>&1"
    run_with_spinner "   Adding HTTPS port to firewall..." "ufw allow 443/tcp >> '$LOG_FILE' 2>&1"
  fi
  
  log "✅ Firewall rules added"
fi

# Set up automatic SSL renewal
if [ "$SETUP_SSL" = true ]; then
  log "🔄 Setting up automatic SSL renewal..."
  
  # Create renewal script
  log "   Creating SSL renewal script..."
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
  
  run_with_spinner "   Making renewal script executable..." "chmod +x renew-ssl.sh"
  
  # Add to crontab to run twice daily (standard for Let's Encrypt)
  log "   Adding renewal task to crontab..."
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

run_with_spinner "   Making health check script executable..." "chmod +x health-check.sh"

# Add health check to crontab
log "   Adding health check to crontab..."
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
log "   - Check service status: systemctl status nanos-dashboard.service"
log "   - Restart service: systemctl restart nanos-dashboard.service"
log "   - View logs: journalctl -u nanos-dashboard.service"
if [ "$ssl_enabled" = "true" ]; then
  log "   - Renew SSL manually: ./renew-ssl.sh"
fi
log "   - Run health check manually: ./health-check.sh"
log "   - Fix SSL permissions: sudo ./fix-ssl-permissions.sh $domain"
log "======================================"

# Add cleanup option for future use
log "📦 Creating cleanup script for future optimization..."
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
run_with_spinner "   Making cleanup script executable..." "chmod +x cleanup.sh"

log "✅ Created cleanup.sh script to remove unnecessary files when you're ready."
log "   Run './cleanup.sh' after confirming everything works correctly."

exit 0 
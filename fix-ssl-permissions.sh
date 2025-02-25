#!/bin/bash
# Script to fix SSL certificate permissions

# Log function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to display usage
usage() {
  echo "Usage: $0 [DOMAIN]"
  echo "Fix SSL certificate permissions for the specified domain."
  echo ""
  echo "Arguments:"
  echo "  DOMAIN    Domain name (default: hetzner.nanosmanager.uk)"
  echo ""
  echo "Example:"
  echo "  $0 example.com"
  exit 1
}

# Check if help was requested
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
fi

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  log "⚠️  This script must be run as root. Please use sudo."
  exit 1
fi

# Domain name
DOMAIN=${1:-"hetzner.nanosmanager.uk"}
log "🔍 Checking SSL certificates for domain: $DOMAIN"

# Certificate paths
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

# Check if certificates exist
if [ ! -e "$CERT_PATH" ] || [ ! -e "$KEY_PATH" ]; then
  log "⚠️  Certificate files not found at expected locations."
  
  # Try to find certificates in archive
  log "🔍 Searching for certificates in archive directory..."
  
  # Check if the archive directory exists
  if [ ! -d "/etc/letsencrypt/archive/" ]; then
    log "❌ Archive directory not found. Let's Encrypt may not be properly installed."
    log "   Try running: sudo apt-get install certbot"
    exit 1
  fi
  
  # Find domain-specific certificates first
  DOMAIN_ARCHIVE="/etc/letsencrypt/archive/$DOMAIN"
  if [ -d "$DOMAIN_ARCHIVE" ]; then
    log "✅ Found domain-specific archive directory: $DOMAIN_ARCHIVE"
    CERT_FILE=$(find "$DOMAIN_ARCHIVE" -name "fullchain*.pem" | sort -r | head -n 1)
    KEY_FILE=$(find "$DOMAIN_ARCHIVE" -name "privkey*.pem" | sort -r | head -n 1)
  else
    # If domain-specific directory doesn't exist, search all archives
    log "🔍 Domain-specific archive not found, searching all archives..."
    CERT_FILE=$(find /etc/letsencrypt/archive/ -name "fullchain*.pem" | sort -r | head -n 1)
    KEY_FILE=$(find /etc/letsencrypt/archive/ -name "privkey*.pem" | sort -r | head -n 1)
  fi
  
  if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
    log "✅ Found certificate files:"
    log "   - Certificate: $CERT_FILE"
    log "   - Key: $KEY_FILE"
    
    # Create directory if it doesn't exist
    mkdir -p "/etc/letsencrypt/live/$DOMAIN/"
    
    # Create symbolic links
    log "🔄 Creating symbolic links..."
    ln -sf "$CERT_FILE" "$CERT_PATH"
    ln -sf "$KEY_FILE" "$KEY_PATH"
    
    log "✅ Symbolic links created successfully."
  else
    log "❌ Could not find certificate files. Please check if Let's Encrypt certificates are installed."
    log "   You may need to run: sudo certbot certonly --standalone -d $DOMAIN"
    exit 1
  fi
fi

# Fix permissions for Let's Encrypt directories
log "🔧 Setting permissions for Let's Encrypt directories..."
chmod -R 755 /etc/letsencrypt/live/
chmod -R 755 /etc/letsencrypt/archive/

# Fix permissions for specific certificate files
log "🔧 Setting permissions for certificate files..."
chmod 644 "$CERT_PATH"
chmod 644 "$KEY_PATH"

log "✅ Permissions set successfully."

# Check if the service exists
if systemctl list-unit-files | grep -q nanos-dashboard.service; then
  # Restart the service
  log "🔄 Restarting Nanos Dashboard service..."
  systemctl restart nanos-dashboard.service

  # Check if service is running
  if systemctl is-active --quiet nanos-dashboard.service; then
    log "✅ Service restarted successfully."
  else
    log "⚠️  Service failed to restart. Please check logs with: journalctl -u nanos-dashboard.service"
  fi
else
  log "⚠️  Nanos Dashboard service not found. Skipping service restart."
fi

# Detailed diagnostics
log "🔍 SSL Configuration:"
log "   - SSL_CERT_PATH: $CERT_PATH"
log "   - SSL_KEY_PATH: $KEY_PATH"
log "   - Certificate exists: $([ -e "$CERT_PATH" ] && echo "Yes" || echo "No")"
log "   - Key exists: $([ -e "$KEY_PATH" ] && echo "Yes" || echo "No")"
log "   - Certificate readable: $([ -r "$CERT_PATH" ] && echo "Yes" || echo "No")"
log "   - Key readable: $([ -r "$KEY_PATH" ] && echo "Yes" || echo "No")"

# Check if .env file exists and update it
ENV_FILE="$(pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  log "🔄 Updating .env file with SSL configuration..."
  
  # Update SSL_ENABLED to true
  sed -i 's/SSL_ENABLED=false/SSL_ENABLED=true/g' "$ENV_FILE"
  
  # Update certificate paths if they're different
  sed -i "s|SSL_CERT_PATH=.*|SSL_CERT_PATH=$CERT_PATH|g" "$ENV_FILE"
  sed -i "s|SSL_KEY_PATH=.*|SSL_KEY_PATH=$KEY_PATH|g" "$ENV_FILE"
  
  log "✅ .env file updated successfully."
else
  log "⚠️  .env file not found. SSL configuration not updated in environment file."
fi

log "✅ SSL permission fix completed."
exit 0 
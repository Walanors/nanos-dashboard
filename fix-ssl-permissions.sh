#!/bin/bash
# Script to fix SSL certificate permissions

# Log function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

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
  CERT_FILE=$(find /etc/letsencrypt/archive/ -name "fullchain*.pem" | sort -r | head -n 1)
  KEY_FILE=$(find /etc/letsencrypt/archive/ -name "privkey*.pem" | sort -r | head -n 1)
  
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

# Restart the service
log "🔄 Restarting Nanos Dashboard service..."
systemctl restart nanos-dashboard.service

# Check if service is running
if systemctl is-active --quiet nanos-dashboard.service; then
  log "✅ Service restarted successfully."
else
  log "⚠️  Service failed to restart. Please check logs with: journalctl -u nanos-dashboard.service"
fi

log "🔍 SSL Configuration:"
log "   - SSL_CERT_PATH: $CERT_PATH"
log "   - SSL_KEY_PATH: $KEY_PATH"
log "   - Certificate exists: $([ -e "$CERT_PATH" ] && echo "Yes" || echo "No")"
log "   - Key exists: $([ -e "$KEY_PATH" ] && echo "Yes" || echo "No")"
log "   - Certificate readable: $([ -r "$CERT_PATH" ] && echo "Yes" || echo "No")"
log "   - Key readable: $([ -r "$KEY_PATH" ] && echo "Yes" || echo "No")"

log "✅ SSL permission fix completed."
exit 0 
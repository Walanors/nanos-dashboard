#!/bin/bash
# quick-install.sh - One-command installation script for Nanos Dashboard

# Default configuration
REPO_URL="https://github.com/Walanors/nanos-dashboard.git"
INSTALL_DIR="/opt/nanos-dashboard"
DOMAIN=""
USERNAME="admin"
PASSWORD=""
PORT="3000"
SETUP_SSL=true

# Function for logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to display usage
usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "Options:"
  echo "  --domain DOMAIN       Domain name (required)"
  echo "  --repo URL            Repository URL (default: $REPO_URL)"
  echo "  --dir PATH            Installation directory (default: $INSTALL_DIR)"
  echo "  --port PORT           Port number (default: $PORT)"
  echo "  --username USERNAME   Admin username (default: $USERNAME)"
  echo "  --password PASSWORD   Admin password (default: random)"
  echo "  --ssl BOOL            Enable SSL setup (true/false, default: $SETUP_SSL)"
  echo "  --help                Display this help message"
  echo ""
  echo "Example:"
  echo "  $0 --domain example.com --username admin --password secret"
  exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --repo)
      REPO_URL="$2"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --username)
      USERNAME="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
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
    --help)
      usage
      ;;
    *)
      log "⚠️  Unknown option: $1"
      usage
      ;;
  esac
done

# Check if domain is provided
if [ -z "$DOMAIN" ]; then
  log "❌ Domain name is required. Use --domain to specify it."
  usage
fi

# Generate random password if not provided
if [ -z "$PASSWORD" ]; then
  PASSWORD=$(openssl rand -base64 12)
  log "🔑 Generated random password: $PASSWORD"
fi

# Welcome message
log "======================================"
log "Nanos Dashboard Quick Installer"
log "======================================"
log ""

# Check if running as root or with sudo
if [ "$(id -u)" -ne 0 ]; then
  log "⚠️  This script must be run as root or with sudo."
  exit 1
fi

# Check for Git
if ! command -v git > /dev/null; then
  log "📦 Git not found. Installing Git..."
  apt-get update && apt-get install -y git
  
  if ! command -v git > /dev/null; then
    log "❌ Failed to install Git. Please install manually and try again."
    exit 1
  fi
fi

# Create installation directory
log "📁 Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Clone the repository
log "📥 Cloning repository from $REPO_URL..."
git clone "$REPO_URL" "$INSTALL_DIR"

if [ $? -ne 0 ]; then
  log "❌ Failed to clone repository. Please check the URL and try again."
  exit 1
fi

# Change to installation directory
cd "$INSTALL_DIR" || exit 1

# Make scripts executable
log "🔧 Making scripts executable..."
chmod +x setup.sh fix-ssl-permissions.sh

# Run the setup script
log "🚀 Running setup script..."
SSL_OPTION="true"
if [ "$SETUP_SSL" = false ]; then
  SSL_OPTION="false"
fi

./setup.sh --domain "$DOMAIN" --port "$PORT" --username "$USERNAME" --password "$PASSWORD" --ssl "$SSL_OPTION"

# Final message
log ""
log "======================================"
log "✅ Quick installation completed!"
log "   For more details, check the logs in $INSTALL_DIR/install.log"
log "======================================"

exit 0 
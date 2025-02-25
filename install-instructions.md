# Nanos Dashboard Installation Instructions

This document provides step-by-step instructions for installing the Nanos Dashboard on your server.

## Prerequisites

- A Linux server (Ubuntu/Debian recommended)
- Root or sudo access
- Git installed
- Internet connection

## Installation Steps

### 1. Clone the Repository

```bash
# Clone the repository
git clone https://github.com/yourusername/nanos-dashboard.git
cd nanos-dashboard
```

### 2. Make Scripts Executable

```bash
# Make the setup scripts executable
chmod +x setup.sh fix-ssl-permissions.sh
```

### 3. Run the Setup Script

You can run the setup script with default values:

```bash
sudo ./setup.sh
```

Or provide custom parameters:

```bash
sudo ./setup.sh --domain your-domain.com --username admin --password your-password
```

### 4. Troubleshooting Common Issues

#### Build Failure: "next: not found"

If you encounter the error `sh: 1: next: not found`, it means Next.js is not installed globally. Fix it by:

```bash
# Install Next.js CLI globally
sudo npm install -g next

# Or modify the setup.sh script to use the local next command
# Change this line in setup.sh:
# npm run build >> "$LOG_FILE" 2>&1
# To:
# npx next build >> "$LOG_FILE" 2>&1
```

#### SSL Certificate Issues

If you have SSL certificate issues, you can fix them with:

```bash
sudo ./fix-ssl-permissions.sh your-domain.com
```

### 5. Full Automated Installation Example

For a fully automated installation with a specific domain:

```bash
# Clone the repository
git clone https://github.com/yourusername/nanos-dashboard.git
cd nanos-dashboard

# Make scripts executable
chmod +x setup.sh fix-ssl-permissions.sh

# Run setup with custom domain and credentials
sudo ./setup.sh --domain your-domain.com --username admin --password your-secure-password
```

## Post-Installation

After installation:

1. Access your dashboard at `https://your-domain.com:3000` (or the port you specified)
2. Log in with the username and password you provided
3. Check the service status with `sudo systemctl status nanos-dashboard.service`

## Additional Commands

- Restart the service: `sudo systemctl restart nanos-dashboard.service`
- View logs: `sudo journalctl -u nanos-dashboard.service`
- Run health check: `./health-check.sh`
- Renew SSL certificates: `./renew-ssl.sh` 
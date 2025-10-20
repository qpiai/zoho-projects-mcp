#!/bin/bash

# Zoho Projects MCP Server Setup Script

set -e

echo "🚀 Zoho Projects MCP Server Setup"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Create project structure
echo "📁 Creating project structure..."
mkdir -p src

# Move index.ts to src if it exists in root
if [ -f "index.ts" ]; then
    mv index.ts src/index.ts
    echo "✅ Moved index.ts to src/"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Build the project
echo ""
echo "🔨 Building project..."
npm run build

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file and add your Zoho credentials"
fi

# Get OS type
OS_TYPE=$(uname -s)
if [ "$OS_TYPE" = "Darwin" ]; then
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [ "$OS_TYPE" = "Linux" ]; then
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
else
    CONFIG_PATH="%APPDATA%\\Claude\\claude_desktop_config.json"
fi

# Create Claude Desktop config snippet
echo ""
echo "📋 Claude Desktop Configuration"
echo "================================"
echo ""
echo "Add the following to your Claude Desktop config file:"
echo "Location: $CONFIG_PATH"
echo ""

CURRENT_DIR=$(pwd)

cat << EOF
{
  "mcpServers": {
    "zoho-projects": {
      "command": "node",
      "args": ["$CURRENT_DIR/dist/index.js"],
      "env": {
        "ZOHO_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN",
        "ZOHO_PORTAL_ID": "YOUR_PORTAL_ID",
        "ZOHO_API_DOMAIN": "https://projectsapi.zoho.com"
      }
    }
  }
}
EOF

echo ""
echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Get your Zoho OAuth credentials:"
echo "   - Visit: https://api-console.zoho.com/"
echo "   - Create a new application"
echo "   - Generate access token with required scopes"
echo ""
echo "2. Update .env file with your credentials:"
echo "   - ZOHO_ACCESS_TOKEN"
echo "   - ZOHO_PORTAL_ID"
echo ""
echo "3. Add the configuration above to your Claude Desktop config"
echo ""
echo "4. Restart Claude Desktop"
echo ""
echo "Need help? Check README.md for detailed instructions."
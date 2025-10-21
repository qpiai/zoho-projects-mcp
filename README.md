# Zoho Projects MCP Server

A Model Context Protocol (MCP) server that provides integration with Zoho Projects API. This server enables AI assistants to interact with Zoho Projects for managing projects, tasks, issues, milestones, and more.

## Features

### Supported Operations

- **Portal Management**
  - List all portals
  - Get portal details

- **Project Management**
  - List projects
  - Get project details
  - Create new projects
  - Update existing projects
  - Delete projects (move to trash)

- **Task Management**
  - List tasks (portal or project level)
  - Get task details
  - Create tasks
  - Update tasks
  - Delete tasks

- **Issue Management**
  - List issues (portal or project level)
  - Get issue details
  - Create issues
  - Update issues

- **Phase/Milestone Management**
  - List phases
  - Create phases

- **Search**
  - Search across portal or project
  - Filter by module (projects, tasks, issues, milestones, forums, events)

- **User Management**
  - List users in portal or project

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Zoho Projects Account** with API access
3. **Zoho OAuth Credentials**

## Setup

### 1. Get Zoho OAuth Credentials (Detailed Guide)

#### Step 1: Create a Zoho Developer Application

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Click **"Add Client"** button
3. Choose **"Self Client"** (recommended for personal use) or **"Server-based Applications"**
4. Fill in the application details:
   - **Client Name**: e.g., "Zoho Projects MCP"
   - **Homepage URL**: Your website or `http://localhost` for testing
   - **Authorized Redirect URIs**: `http://localhost:8080/callback` (or your preferred redirect URL)
5. Click **"Create"** and note down:
   - **Client ID** (e.g., `1000.XXXXXXXXXX`)
   - **Client Secret** (keep this secure!)

#### Step 2: Generate Authorization Code

1. Build the authorization URL with required scopes:
   ```
   https://accounts.zoho.{REGION}/oauth/v2/auth?
     scope=ZohoProjects.portals.ALL,ZohoProjects.projects.ALL,ZohoProjects.tasks.ALL,ZohoProjects.bugs.ALL,ZohoProjects.milestones.ALL,ZohoProjects.users.READ,ZohoSearch.securesearch.READ
     &client_id=YOUR_CLIENT_ID
     &response_type=code
     &access_type=offline
     &redirect_uri=YOUR_REDIRECT_URI
   ```

   Replace `{REGION}` with your region:
   - US: `com`
   - EU: `eu`
   - IN: `in`
   - AU: `com.au`
   - CN: `com.cn`

2. Open this URL in your browser
3. Log in to your Zoho account and authorize the application
4. You'll be redirected to your redirect URI with a **code** parameter in the URL:
   ```
   http://localhost:8080/callback?code=1000.XXXXX.XXXXX&location=in&accounts-server=https://accounts.zoho.in
   ```
5. Copy the `code` value (valid for ~2 minutes, use it immediately!)

#### Step 3: Exchange Code for Tokens

Use this curl command to get your access and refresh tokens:

```bash
curl -X POST https://accounts.zoho.{REGION}/oauth/v2/token \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=YOUR_REDIRECT_URI" \
  -d "grant_type=authorization_code"
```

Response will contain:
```json
{
  "access_token": "1000.xxxx.yyyy",
  "refresh_token": "1000.zzzz.aaaa",
  "expires_in": 3600,
  "api_domain": "https://www.zohoapis.in",
  "token_type": "Bearer"
}
```

**Important:** Save both tokens:
- **access_token**: Valid for 1 hour (auto-refreshed by the server)
- **refresh_token**: Long-lived, used to get new access tokens

#### Step 4: Find Your Portal ID

**Method 1: From URL**
1. Go to your Zoho Projects in browser
2. Look at the URL: `https://projects.zoho.{REGION}/portal/{PORTAL_ID}/...`
3. The number after `/portal/` is your Portal ID (e.g., `60028147039`)

**Method 2: Using API**
```bash
curl -X GET https://projectsapi.zoho.{REGION}/api/v3/portals \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

Response will list all your portals with their IDs.

#### Step 5: Verify Credentials

Test your setup with this API call:
```bash
curl -X GET https://projectsapi.zoho.{REGION}/api/v3/portal/YOUR_PORTAL_ID/projects \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

**Expected:** JSON response with your projects list
**If error:** Check token, portal ID, and API domain match your region

#### Required Scopes Summary

Make sure your OAuth token has these scopes:
- ✅ `ZohoProjects.portals.ALL` - Portal operations
- ✅ `ZohoProjects.projects.ALL` - Project management
- ✅ `ZohoProjects.tasks.ALL` - Task management
- ✅ `ZohoProjects.bugs.ALL` - Issue/bug management
- ✅ `ZohoProjects.milestones.ALL` - Milestone/phase management
- ✅ `ZohoProjects.users.READ` - User information
- ✅ `ZohoSearch.securesearch.READ` - Search functionality

### 2. Setup and Installation

<!--
#### Docker Setup (NOT CURRENTLY WORKING - DISABLED)

Docker support is currently disabled due to npm package installation issues in containerized environments.
If you need Docker support, please open an issue on GitHub and we can work on a solution.

#### Option A: Docker Setup (Recommended - Easiest) 🐳

**Prerequisites:**
- Docker and Docker Compose installed

**Steps:**

1. Clone the repository:
```bash
git clone <repository-url>
cd zoho-mcp
```

2. Create `.env` file with your credentials:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Run with Docker Compose:

**For HTTP Server (remote access):**
```bash
docker-compose --profile http up -d
```

**For Stdio Server (local/Claude Desktop):**
```bash
docker-compose --profile stdio up
```

4. Check the server is running:
```bash
# For HTTP server
curl http://localhost:3001/health

# View logs
docker-compose logs -f
```
-->

#### Node.js Setup

**Prerequisites:**
- Node.js (v18 or higher)

**Steps:**

1. Clone and install:
```bash
git clone <repository-url>
cd zoho-mcp
npm install
npm run build
```

2. Create `.env` file with your credentials (see Configuration section below)

3. Run the server:
```bash
# Stdio server (for local MCP clients)
npm start

# HTTP server (for remote access)
npm run start:http
```

### 3. Configuration

Create a `.env` file in the project root with the following variables:

```bash
# OAuth credentials (required)
ZOHO_ACCESS_TOKEN=your_access_token_here
ZOHO_REFRESH_TOKEN=your_refresh_token_here
ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here

# Portal configuration (required)
ZOHO_PORTAL_ID=your_portal_id_here

# API domain (optional, choose based on your region)
ZOHO_API_DOMAIN=https://projectsapi.zoho.com
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.com

# HTTP Server configuration (optional, for remote access)
HTTP_PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
ALLOWED_HOSTS=127.0.0.1,localhost
```

**Region-specific domains:**
- US: `projectsapi.zoho.com` / `accounts.zoho.com`
- EU: `projectsapi.zoho.eu` / `accounts.zoho.eu`
- IN: `projectsapi.zoho.in` / `accounts.zoho.in`
- AU: `projectsapi.zoho.com.au` / `accounts.zoho.com.au`
- CN: `projectsapi.zoho.com.cn` / `accounts.zoho.com.cn`

### 4. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### For Node.js Setup:
```json
{
  "mcpServers": {
    "zoho-projects": {
      "command": "node",
      "args": ["/absolute/path/to/zoho-mcp/dist/index.js"],
      "env": {
        "ZOHO_ACCESS_TOKEN": "your_access_token_here",
        "ZOHO_REFRESH_TOKEN": "your_refresh_token_here",
        "ZOHO_CLIENT_ID": "your_client_id_here",
        "ZOHO_CLIENT_SECRET": "your_client_secret_here",
        "ZOHO_PORTAL_ID": "your_portal_id_here",
        "ZOHO_API_DOMAIN": "https://projectsapi.zoho.in",
        "ZOHO_ACCOUNTS_DOMAIN": "https://accounts.zoho.in"
      }
    }
  }
}
```

<!--
#### For Docker Setup (NOT CURRENTLY WORKING - DISABLED):
```json
{
  "mcpServers": {
    "zoho-projects": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--env-file", "/absolute/path/to/zoho-mcp/.env", "zoho-mcp-stdio"],
      "env": {}
    }
  }
}
```

**Note:** For Docker setup, first build the image:
```bash
cd /path/to/zoho-mcp
docker build -t zoho-mcp-stdio .
```
-->

## Usage Examples

Once configured, you can use Claude to interact with Zoho Projects:

### List Projects
```
Can you list all my Zoho Projects?
```

### Create a New Project
```
Create a new project called "Website Redesign" with description "Redesign company website" starting on 2025-01-15 and ending on 2025-03-31
```

### List Tasks
```
Show me all tasks in project ID 1234567890
```

### Create a Task
```
Create a high priority task called "Design homepage mockup" in project 1234567890, due on 2025-02-15
```

### Search
```
Search for "bug fix" in all modules
```

### List Issues
```
Show me all issues in project 1234567890
```

## Project Structure

```
zoho-projects-mcp-server/
├── src/
│   └── index.ts          # Main server implementation
├── dist/                  # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Available Tools

The server provides the following MCP tools:

1. `list_portals` - Get all portals
2. `get_portal` - Get portal details
3. `list_projects` - List all projects
4. `get_project` - Get project details
5. `create_project` - Create a new project
6. `update_project` - Update a project
7. `delete_project` - Delete a project
8. `list_tasks` - List tasks
9. `get_task` - Get task details
10. `create_task` - Create a task
11. `update_task` - Update a task
12. `delete_task` - Delete a task
13. `list_issues` - List issues
14. `get_issue` - Get issue details
15. `create_issue` - Create an issue
16. `update_issue` - Update an issue
17. `list_phases` - List phases/milestones
18. `create_phase` - Create a phase
19. `search` - Search portal or project
20. `list_users` - List users

## Troubleshooting

### Authentication Issues
- Ensure your access token is valid and not expired
- Verify the token has the required scopes
- Check that the portal ID is correct

### API Errors
- Check the Zoho API documentation for rate limits
- Ensure you're using the correct API domain for your region
- Verify that the user has appropriate permissions

### Connection Issues
- Restart Claude Desktop after configuration changes
- Check the Claude Desktop logs for error messages
- Verify the server path in the configuration

## OAuth Token Management

### Token Expiration
Access tokens expire after 1 hour (3600 seconds). This MCP server automatically refreshes tokens using the refresh token.

### Manual Token Refresh
If you need to manually refresh your access token:

```bash
# For India region (accounts.zoho.in)
curl -X POST https://accounts.zoho.in/oauth/v2/token \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "grant_type=refresh_token"

# For other regions, use the appropriate accounts domain:
# US: https://accounts.zoho.com/oauth/v2/token
# EU: https://accounts.zoho.eu/oauth/v2/token
# AU: https://accounts.zoho.com.au/oauth/v2/token
# CN: https://accounts.zoho.com.cn/oauth/v2/token
```

Response example:
```json
{
  "access_token": "1000.xxx.yyy",
  "scope": "ZohoProjects.portals.ALL ZohoProjects.projects.ALL...",
  "api_domain": "https://www.zohoapis.in",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Automatic Token Refresh
The MCP server automatically handles token refresh. Configure the following environment variables:

```bash
ZOHO_REFRESH_TOKEN=your_refresh_token_here
ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.in  # Match your region
```

The server will automatically refresh the access token before it expires.

## API Reference

For detailed API documentation, visit:
https://projects.zoho.com/api-docs

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Support

For issues related to:
- **MCP Server**: Open an issue in this repository
- **Zoho Projects API**: Contact Zoho support or check their documentation
- **Claude Desktop**: Check Anthropic's documentation
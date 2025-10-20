# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server for Zoho Projects API integration. It enables AI assistants to interact with Zoho Projects for managing portals, projects, tasks, issues, milestones, and users.

## Development Commands

### Build & Run
- `npm run build` - Compile TypeScript to JavaScript (output to `dist/`)
- `npm run dev` - Watch mode compilation
- `npm start` - Run the compiled stdio server (for local MCP clients)
- `npm run start:http` - Run the HTTP/SSE server (for remote access)
- `npm run dev:http` - Development mode for HTTP server with watch
- `npm test` - Run connection test using test-connection.js
- `npm run setup` - Run setup.sh script

### Environment Setup

#### Required Variables (for both transports)
- `ZOHO_ACCESS_TOKEN` - OAuth access token (expires after 1 hour)
- `ZOHO_PORTAL_ID` - Portal ID for API requests
- `ZOHO_API_DOMAIN` - API domain (defaults to https://projectsapi.zoho.com)

#### HTTP Server Variables (optional, for remote access)
- `HTTP_PORT` - Port for HTTP server (defaults to 3001)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (defaults to http://localhost:3000)
- `ALLOWED_HOSTS` - Comma-separated list of allowed hosts for DNS rebinding protection (defaults to 127.0.0.1,localhost)

API domains by region:
- US: https://projectsapi.zoho.com
- EU: https://projectsapi.zoho.eu
- IN: https://projectsapi.zoho.in
- AU: https://projectsapi.zoho.com.au
- CN: https://projectsapi.zoho.com.cn

## Architecture

### Core Structure
- **Dual transport support**:
  - `src/index.ts` - stdio transport for local MCP clients (Claude Desktop, etc.)
  - `src/http-server.ts` - HTTP/SSE transport for remote access
- **Class-based design**: `ZohoProjectsServer` class encapsulates all functionality
- **Transport options**:
  - **stdio**: Standard I/O transport for local/same-machine MCP clients
  - **HTTP with SSE**: StreamableHTTPServerTransport for remote access with session management
- **HTTP client**: Native fetch API for Zoho API calls

### Transport Modes

#### stdio Transport (src/index.ts)
- **Use case**: Local MCP clients (Claude Desktop, local apps)
- **Entry point**: `npm start` or `node dist/index.js`
- **Communication**: Standard input/output streams
- **Sessions**: Single session per process

#### HTTP/SSE Transport (src/http-server.ts)
- **Use case**: Remote access, web clients, multiple concurrent clients
- **Entry point**: `npm run start:http` or `node dist/http-server.js`
- **Communication**: HTTP POST requests + optional SSE streaming
- **Sessions**: Multi-session with UUID-based session management
- **Security**: CORS configuration, DNS rebinding protection, allowed hosts/origins
- **Endpoints**:
  - `POST /mcp` - Main MCP endpoint (handles all MCP protocol messages)
  - `GET /health` - Health check endpoint (returns active session count)
  - `GET /` - Server info endpoint (returns server metadata)
- **Session Management**: Each client receives a unique session ID via `X-Session-ID` header

### Key Components

1. **ZohoProjectsServer class** (src/index.ts:18)
   - Initializes MCP server with stdio transport
   - Loads config from environment variables
   - Sets up tool handlers and request routing

2. **API Request Handler** (src/index.ts:50)
   - `makeRequest()` method handles all HTTP communication
   - Constructs full URL from base API domain + endpoint
   - Adds OAuth token to headers
   - Parses JSON responses and handles errors

3. **Tool Definitions** (src/index.ts:92)
   - 20 MCP tools registered via ListToolsRequestSchema
   - Each tool has JSON schema for input validation
   - Tools grouped by domain: portals, projects, tasks, issues, phases, search, users

4. **Tool Execution Router** (src/index.ts:460)
   - CallToolRequestSchema handler routes to appropriate private methods
   - Switch statement maps tool names to implementation methods
   - Standardized error handling with McpError

### Tool Implementation Pattern
Each tool follows this pattern:
1. Accept typed parameters
2. Build API endpoint URL with portal ID
3. Call `makeRequest()` with method and optional body
4. Return formatted MCP response with JSON text content

### API Endpoint Structure
All endpoints follow: `/api/v3/portal/{portalId}/{resource}/{id?}/{action?}`

Examples:
- Projects: `/portal/{portalId}/projects`
- Tasks: `/portal/{portalId}/projects/{projectId}/tasks`
- Search: `/portal/{portalId}/search?search_term=...`

### Authentication Flow
- OAuth token passed as `Zoho-oauthtoken {token}` header
- Token validation happens on first API call
- No automatic token refresh (must be done externally)

## Key Implementation Details

- **Date format**: All dates use YYYY-MM-DD format
- **Error handling**: McpError with ErrorCode enum for all failures
- **Pagination**: Supported on list operations with page/per_page params
- **Optional project scoping**: Some operations (tasks, issues, users) work at portal or project level
- **Delete behavior**: Projects use trash endpoint, tasks/issues use DELETE

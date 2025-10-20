#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import "dotenv/config";

interface ZohoConfig {
  accessToken: string;
  portalId: string;
  apiDomain?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  accountsDomain?: string;
}

class ZohoProjectsServer {
  private server: Server;
  private config: ZohoConfig;
  private baseUrl: string = "https://projectsapi.zoho.com/api/v3";
  private tokenExpiresAt: number = 0; // Unix timestamp in milliseconds

  constructor() {
    this.server = new Server(
      {
        name: "zoho-projects-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Load configuration from environment variables
    this.config = {
      accessToken: process.env.ZOHO_ACCESS_TOKEN || "",
      portalId: process.env.ZOHO_PORTAL_ID || "",
      apiDomain: process.env.ZOHO_API_DOMAIN || "https://projectsapi.zoho.com",
      refreshToken: process.env.ZOHO_REFRESH_TOKEN || "",
      clientId: process.env.ZOHO_CLIENT_ID || "",
      clientSecret: process.env.ZOHO_CLIENT_SECRET || "",
      accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com",
    };

    if (this.config.apiDomain) {
      this.baseUrl = `${this.config.apiDomain}/api/v3`;
    }

    // Set initial token expiration (assume current token expires in 1 hour if not known)
    this.tokenExpiresAt = Date.now() + 3600 * 1000;

    this.setupHandlers();
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config.refreshToken || !this.config.clientId || !this.config.clientSecret) {
      console.error("Cannot refresh token: missing refresh token, client ID, or client secret");
      return;
    }

    try {
      const params = new URLSearchParams({
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
      });

      const response = await fetch(`${this.config.accountsDomain}/oauth/v2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        access_token: string;
        expires_in: number;
      };

      // Update access token and expiration time
      this.config.accessToken = data.access_token;
      // Set expiration to 5 minutes before actual expiry for safety margin
      this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

      console.error(`Access token refreshed successfully. Expires in ${data.expires_in} seconds.`);
    } catch (error) {
      console.error(`Error refreshing access token: ${error}`);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to refresh access token: ${error}`
      );
    }
  }

  private async makeRequest(
    endpoint: string,
    method: string = "GET",
    body?: any,
    isRetry: boolean = false
  ): Promise<any> {
    // Check if token needs refresh (5 minutes before expiry)
    if (Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }

    if (!this.config.accessToken) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Zoho access token not configured. Set ZOHO_ACCESS_TOKEN environment variable."
      );
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Zoho-oauthtoken ${this.config.accessToken}`,
      "Content-Type": "application/json",
    };

    const options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    } = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();

      // If 401 and we have refresh credentials and haven't retried yet, try refresh
      if (response.status === 401 && !isRetry &&
          this.config.refreshToken && this.config.clientId && this.config.clientSecret) {
        console.error("Received 401 error, attempting token refresh...");
        try {
          await this.refreshAccessToken();
          // Retry the request once with new token
          return await this.makeRequest(endpoint, method, body, true);
        } catch (refreshError) {
          console.error("Token refresh failed:", refreshError);
          // Fall through to throw original error
        }
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Zoho API error: ${response.status} - ${errorText}`
      );
    }

    return response.json();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Portal operations
        {
          name: "list_portals",
          description: "Retrieve all Zoho Projects portals",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_portal",
          description: "Get details of a specific portal",
          inputSchema: {
            type: "object",
            properties: {
              portal_id: { type: "string", description: "Portal ID" },
            },
            required: ["portal_id"],
          },
        },

        // Project operations
        {
          name: "list_projects",
          description: "List all projects in a portal",
          inputSchema: {
            type: "object",
            properties: {
              page: { type: "number", description: "Page number", default: 1 },
              per_page: {
                type: "number",
                description: "Items per page",
                default: 10,
              },
            },
          },
        },
        {
          name: "get_project",
          description: "Get details of a specific project",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
            },
            required: ["project_id"],
          },
        },
        {
          name: "create_project",
          description: "Create a new project",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Project name" },
              description: { type: "string", description: "Project description" },
              start_date: {
                type: "string",
                description: "Start date (YYYY-MM-DD)",
              },
              end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
              is_public: {
                type: "boolean",
                description: "Is project public",
                default: false,
              },
            },
            required: ["name"],
          },
        },
        {
          name: "update_project",
          description: "Update an existing project",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              name: { type: "string", description: "Project name" },
              description: { type: "string", description: "Project description" },
              start_date: {
                type: "string",
                description: "Start date (YYYY-MM-DD)",
              },
              end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
              status: {
                type: "string",
                description: "Project status",
                enum: ["active", "template", "archived"],
              },
            },
            required: ["project_id"],
          },
        },
        {
          name: "delete_project",
          description: "Delete a project (moves to trash)",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
            },
            required: ["project_id"],
          },
        },

        // Task operations
        {
          name: "list_tasks",
          description: "List tasks from a project or portal",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Project ID (optional for portal-level)",
              },
              page: { type: "number", description: "Page number", default: 1 },
              per_page: {
                type: "number",
                description: "Items per page",
                default: 10,
              },
            },
          },
        },
        {
          name: "get_task",
          description: "Get details of a specific task",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              task_id: { type: "string", description: "Task ID" },
            },
            required: ["project_id", "task_id"],
          },
        },
        {
          name: "create_task",
          description: "Create a new task in a project",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              name: { type: "string", description: "Task name" },
              description: { type: "string", description: "Task description" },
              priority: {
                type: "string",
                description: "Task priority",
                enum: ["none", "low", "medium", "high"],
              },
              start_date: {
                type: "string",
                description: "Start date (YYYY-MM-DD)",
              },
              end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
              assignee_zpuid: {
                type: "string",
                description: "Assignee user ZPUID",
              },
            },
            required: ["project_id", "name"],
          },
        },
        {
          name: "update_task",
          description: "Update a task",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              task_id: { type: "string", description: "Task ID" },
              name: { type: "string", description: "Task name" },
              description: { type: "string", description: "Task description" },
              priority: {
                type: "string",
                description: "Task priority",
                enum: ["none", "low", "medium", "high"],
              },
              start_date: {
                type: "string",
                description: "Start date (YYYY-MM-DD)",
              },
              end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
            },
            required: ["project_id", "task_id"],
          },
        },
        {
          name: "delete_task",
          description: "Delete a task",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              task_id: { type: "string", description: "Task ID" },
            },
            required: ["project_id", "task_id"],
          },
        },

        // Issue operations
        {
          name: "list_issues",
          description: "List issues from a project or portal",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Project ID (optional for portal-level)",
              },
              page: { type: "number", description: "Page number", default: 1 },
              per_page: {
                type: "number",
                description: "Items per page",
                default: 10,
              },
            },
          },
        },
        {
          name: "get_issue",
          description: "Get details of a specific issue",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              issue_id: { type: "string", description: "Issue ID" },
            },
            required: ["project_id", "issue_id"],
          },
        },
        {
          name: "create_issue",
          description: "Create a new issue",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              title: { type: "string", description: "Issue title" },
              description: { type: "string", description: "Issue description" },
              severity: {
                type: "string",
                description: "Issue severity",
                enum: ["minor", "major", "critical"],
              },
              due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
            },
            required: ["project_id", "title"],
          },
        },
        {
          name: "update_issue",
          description: "Update an issue",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              issue_id: { type: "string", description: "Issue ID" },
              title: { type: "string", description: "Issue title" },
              description: { type: "string", description: "Issue description" },
              severity: {
                type: "string",
                description: "Issue severity",
                enum: ["minor", "major", "critical"],
              },
            },
            required: ["project_id", "issue_id"],
          },
        },

        // Milestone/Phase operations
        {
          name: "list_phases",
          description: "List phases/milestones from a project",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              page: { type: "number", description: "Page number", default: 1 },
              per_page: {
                type: "number",
                description: "Items per page",
                default: 10,
              },
            },
            required: ["project_id"],
          },
        },
        {
          name: "create_phase",
          description: "Create a new phase/milestone",
          inputSchema: {
            type: "object",
            properties: {
              project_id: { type: "string", description: "Project ID" },
              name: { type: "string", description: "Phase name" },
              start_date: {
                type: "string",
                description: "Start date (YYYY-MM-DD)",
              },
              end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
              owner_zpuid: { type: "string", description: "Owner user ZPUID" },
            },
            required: ["project_id", "name"],
          },
        },

        // Search
        {
          name: "search",
          description: "Search across portal or project",
          inputSchema: {
            type: "object",
            properties: {
              search_term: {
                type: "string",
                description: "Search term/query",
              },
              project_id: {
                type: "string",
                description: "Project ID (optional for portal-level search)",
              },
              module: {
                type: "string",
                description: "Module to search in",
                enum: [
                  "all",
                  "projects",
                  "tasks",
                  "issues",
                  "milestones",
                  "forums",
                  "events",
                ],
              },
              page: { type: "number", description: "Page number", default: 1 },
              per_page: {
                type: "number",
                description: "Items per page",
                default: 10,
              },
            },
            required: ["search_term"],
          },
        },

        // Users
        {
          name: "list_users",
          description: "List users in a portal or project",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Project ID (optional for portal-level)",
              },
            },
          },
        },
      ],
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Cast args to any since JSON schema validation handles type safety
      const params = (args || {}) as any;

      try {
        switch (name) {
          // Portal operations
          case "list_portals":
            return await this.listPortals();
          case "get_portal":
            return await this.getPortal(params.portal_id);

          // Project operations
          case "list_projects":
            return await this.listProjects(params.page, params.per_page);
          case "get_project":
            return await this.getProject(params.project_id);
          case "create_project":
            return await this.createProject(params);
          case "update_project":
            return await this.updateProject(params);
          case "delete_project":
            return await this.deleteProject(params.project_id);

          // Task operations
          case "list_tasks":
            return await this.listTasks(params.project_id, params.page, params.per_page);
          case "get_task":
            return await this.getTask(params.project_id, params.task_id);
          case "create_task":
            return await this.createTask(params);
          case "update_task":
            return await this.updateTask(params);
          case "delete_task":
            return await this.deleteTask(params.project_id, params.task_id);

          // Issue operations
          case "list_issues":
            return await this.listIssues(params.project_id, params.page, params.per_page);
          case "get_issue":
            return await this.getIssue(params.project_id, params.issue_id);
          case "create_issue":
            return await this.createIssue(params);
          case "update_issue":
            return await this.updateIssue(params);

          // Phase operations
          case "list_phases":
            return await this.listPhases(params.project_id, params.page, params.per_page);
          case "create_phase":
            return await this.createPhase(params);

          // Search
          case "search":
            return await this.search(params);

          // Users
          case "list_users":
            return await this.listUsers(params.project_id);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${name}: ${error}`
        );
      }
    });
  }

  // Portal operations
  private async listPortals() {
    const data = await this.makeRequest("/portals");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async getPortal(portalId: string) {
    const data = await this.makeRequest(`/portal/${portalId}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  // Project operations
  private async listProjects(page: number = 1, perPage: number = 10) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects?page=${page}&per_page=${perPage}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async getProject(projectId: string) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${projectId}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async createProject(params: any) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects`,
      "POST",
      params
    );
    return {
      content: [
        {
          type: "text",
          text: `Project created successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  private async updateProject(params: any) {
    const { project_id, ...updateData } = params;
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${project_id}`,
      "PATCH",
      updateData
    );
    return {
      content: [
        {
          type: "text",
          text: `Project updated successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  private async deleteProject(projectId: string) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${projectId}/trash`,
      "POST"
    );
    return {
      content: [
        {
          type: "text",
          text: `Project moved to trash successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  // Task operations
  private async listTasks(
    projectId?: string,
    page: number = 1,
    perPage: number = 10
  ) {
    const endpoint = projectId
      ? `/portal/${this.config.portalId}/projects/${projectId}/tasks?page=${page}&per_page=${perPage}`
      : `/portal/${this.config.portalId}/tasks?page=${page}&per_page=${perPage}`;
    const data = await this.makeRequest(endpoint);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async getTask(projectId: string, taskId: string) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${projectId}/tasks/${taskId}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async createTask(params: any) {
    const { project_id, ...taskData } = params;
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${project_id}/tasks`,
      "POST",
      taskData
    );
    return {
      content: [
        {
          type: "text",
          text: `Task created successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  private async updateTask(params: any) {
    const { project_id, task_id, ...taskData } = params;
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${project_id}/tasks/${task_id}`,
      "PATCH",
      taskData
    );
    return {
      content: [
        {
          type: "text",
          text: `Task updated successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  private async deleteTask(projectId: string, taskId: string) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${projectId}/tasks/${taskId}`,
      "DELETE"
    );
    return {
      content: [
        {
          type: "text",
          text: `Task deleted successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  // Issue operations
  private async listIssues(
    projectId?: string,
    page: number = 1,
    perPage: number = 10
  ) {
    const endpoint = projectId
      ? `/portal/${this.config.portalId}/projects/${projectId}/issues?page=${page}&per_page=${perPage}`
      : `/portal/${this.config.portalId}/issues?page=${page}&per_page=${perPage}`;
    const data = await this.makeRequest(endpoint);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async getIssue(projectId: string, issueId: string) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${projectId}/issues/${issueId}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async createIssue(params: any) {
    const { project_id, ...issueData } = params;
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${project_id}/issues`,
      "POST",
      issueData
    );
    return {
      content: [
        {
          type: "text",
          text: `Issue created successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  private async updateIssue(params: any) {
    const { project_id, issue_id, ...issueData } = params;
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${project_id}/issues/${issue_id}`,
      "PATCH",
      issueData
    );
    return {
      content: [
        {
          type: "text",
          text: `Issue updated successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  // Phase operations
  private async listPhases(
    projectId: string,
    page: number = 1,
    perPage: number = 10
  ) {
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${projectId}/phases?page=${page}&per_page=${perPage}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async createPhase(params: any) {
    const { project_id, ...phaseData } = params;
    const data = await this.makeRequest(
      `/portal/${this.config.portalId}/projects/${project_id}/phases`,
      "POST",
      phaseData
    );
    return {
      content: [
        {
          type: "text",
          text: `Phase created successfully:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  // Search
  private async search(params: any) {
    const { search_term, project_id, module = "all", page = 1, per_page = 10 } = params;
    const endpoint = project_id
      ? `/portal/${this.config.portalId}/projects/${project_id}/search?search_term=${encodeURIComponent(search_term)}&module=${module}&page=${page}&per_page=${per_page}`
      : `/portal/${this.config.portalId}/search?search_term=${encodeURIComponent(search_term)}&module=${module}&status=active&page=${page}&per_page=${per_page}`;
    const data = await this.makeRequest(endpoint);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  // Users
  private async listUsers(projectId?: string) {
    const endpoint = projectId
      ? `/portal/${this.config.portalId}/projects/${projectId}/users`
      : `/portal/${this.config.portalId}/users`;
    const data = await this.makeRequest(endpoint);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  getServer(): Server {
    return this.server;
  }
}

// HTTP Server setup with session management
const app = express();

// Use json middleware only for non-MCP routes
app.use((req, res, next) => {
  if (req.path === '/mcp') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Server configuration
const PORT = Number(process.env.HTTP_PORT) || 3001;

// Default allowed hosts with port
const defaultAllowedHosts = [
  "127.0.0.1",
  "localhost",
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`
];

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const servers: { [sessionId: string]: ZohoProjectsServer } = {};

// MCP endpoint
app.post("/mcp", async (req, res) => {
  try {
    // Get or create session ID from header or generate new one
    let sessionId = (req.headers["mcp-session-id"] || req.headers["x-session-id"]) as string;

    if (!sessionId) {
      sessionId = randomUUID();
    }

    // Create new transport and server for this session if it doesn't exist
    if (!transports[sessionId]) {
      const allowedHosts = process.env.ALLOWED_HOSTS
        ? process.env.ALLOWED_HOSTS.split(",")
        : defaultAllowedHosts;

      transports[sessionId] = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        enableDnsRebindingProtection: false,
      });

      servers[sessionId] = new ZohoProjectsServer();
      await servers[sessionId].getServer().connect(transports[sessionId]);

      console.error(`New MCP session created: ${sessionId}`);
    }

    // Set session ID in response header
    res.setHeader("X-Session-ID", sessionId);

    // Handle the request
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    activeSessions: Object.keys(transports).length,
    timestamp: new Date().toISOString()
  });
});

// Server info endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Zoho Projects MCP Server",
    version: "1.0.0",
    transport: "StreamableHTTP",
    endpoints: {
      mcp: "/mcp",
      health: "/health",
    },
    activeSessions: Object.keys(transports).length,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.error(`Zoho Projects MCP HTTP server running on 0.0.0.0:${PORT}`);
  console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.error(`Health check: http://localhost:${PORT}/health`);
});

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "web_search",
    description:
      "Search the web for current information using Perplexity AI. Returns a grounded answer with citations. Use this when the user asks about recent events, facts, or anything requiring up-to-date information.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on the web.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch a URL and return its readable text content (SSRF-safe — private/loopback addresses are blocked). Use this to read articles, documentation, or any publicly accessible web page.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL (http or https) to fetch.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "link_preview",
    description:
      "Get the title, description, and preview image from a URL without fetching the full page content. Useful for summarising links shared by the user.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL (http or https) to preview.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a task or to-do item for the user and persist it to the database. Use this when the user asks you to remember something they need to do, or explicitly requests a task be created.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "A clear, concise description of the task to create.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "analyze_image",
    description:
      "Analyze an image from a URL using Claude's vision capability. Returns a detailed description of the image contents including text, objects, people, and context.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL (http or https) of the image to analyze.",
        },
        prompt: {
          type: "string",
          description:
            "Optional question or instruction about the image, e.g. 'What text is visible?' or 'Describe the chart.'",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "run_code",
    description:
      "Execute code safely in a Docker sandbox. Returns stdout, stderr, and exit code. Supports python, javascript, typescript, bash.",
    input_schema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["python", "javascript", "typescript", "bash"],
          description: "Programming language to execute",
        },
        code: {
          type: "string",
          description: "The code to execute",
        },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "delegate_to_agent",
    description:
      "Delegate a sub-task to a specialized sub-agent. The sub-agent has full capabilities including memory, web search, and reasoning. Use this for complex tasks that benefit from isolation or parallelization.",
    input_schema: {
      type: "object",
      properties: {
        agent_name: {
          type: "string",
          description: "Name/role for this sub-agent (e.g. 'researcher', 'coder')",
        },
        task: {
          type: "string",
          description: "The full task description for the sub-agent",
        },
      },
      required: ["agent_name", "task"],
    },
  },
  {
    name: "read_pdf",
    description:
      "Extract text content from a PDF file. Provide a file path or URL to a PDF. Returns the extracted text and page count.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File system path to the PDF file",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "sessions_list",
    description: "List recent conversation sessions for the user.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of sessions to return (default 10).",
        },
      },
      required: [],
    },
  },
  {
    name: "sessions_history",
    description: "Get the conversation history for a specific session.",
    input_schema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The session ID to retrieve history for.",
        },
        limit: {
          type: "number",
          description: "Maximum number of messages to return (default 20).",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "sessions_send",
    description:
      "Send a message to a different active session. Use for cross-session coordination.",
    input_schema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The target session ID to send the message to.",
        },
        message: {
          type: "string",
          description: "The message to send to the target session.",
        },
      },
      required: ["session_id", "message"],
    },
  },
  {
    name: "sessions_spawn",
    description:
      "Spawn a new isolated sub-agent session with a specific task. The spawned session runs independently with its own conversation history. Returns the session ID and initial response. Use for parallel task delegation or isolated sub-tasks.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The initial task or instructions for the spawned sub-agent session.",
        },
        session_id: {
          type: "string",
          description: "Optional custom session ID for the new session. Auto-generated if not provided.",
        },
      },
      required: ["task"],
    },
  },
];

export const TOOL_NAMES = [
  "web_search",
  "web_fetch",
  "link_preview",
  "create_task",
  "analyze_image",
  "run_code",
  "delegate_to_agent",
  "read_pdf",
  "sessions_list",
  "sessions_history",
  "sessions_send",
  "sessions_spawn",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

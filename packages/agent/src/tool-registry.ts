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
  {
    name: "memory_search",
    description:
      "Search your long-term memory for relevant information. Returns the most semantically relevant stored memories. Use when you need to recall past facts, preferences, or context the user shared previously.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up in long-term memory.",
        },
        limit: {
          type: "number",
          description: "Maximum number of memory results to return (default 5).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_save",
    description:
      "Save an important piece of information to long-term memory. Use when the user shares a preference, personal detail, or fact that should be remembered across conversations.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The information to save to long-term memory.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "memory_forget",
    description:
      "Delete a specific memory by its exact text. Use when the user asks you to forget something specific. For forgetting everything use memory_forget_all.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The exact text of the memory to delete.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "memory_forget_all",
    description:
      "Delete all stored memories for this user. Use only when the user explicitly asks to forget everything or reset all memory.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "memory_get",
    description:
      "Retrieve stored memories matching a text pattern. Returns memories that contain the given substring. Use after memory_search to get the full text of a specific memory, or to check if something specific is already saved.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Substring to match against stored memories.",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 5).",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "cron",
    description:
      "Manage scheduled tasks (cron jobs). Supports actions: list (list all scheduled tasks), add (create a new scheduled task), remove (delete a task by id), enable (re-enable a paused task), disable (pause a task), status (show next run times).",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "add", "remove", "enable", "disable", "status"],
          description: "The action to perform on cron jobs.",
        },
        id: {
          type: "string",
          description: "Job ID — required for remove, enable, and disable actions.",
        },
        expression: {
          type: "string",
          description: "Cron expression for the add action, e.g. \"0 9 * * 1-5\".",
        },
        task: {
          type: "string",
          description: "Task description for the add action.",
        },
        channel: {
          type: "string",
          description: "Delivery channel for the add action. Defaults to current session channel.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "session_status",
    description:
      "Get the status of the current session: estimated token usage, approximate cost, session ID, and current model. Useful for the user to monitor usage.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser",
    description:
      "Control a web browser to automate tasks: navigate to URLs, click elements, type text, take screenshots, extract page text, run JavaScript, or scroll. Requires Chrome running with --remote-debugging-port=9222 (CHROME_HOST / CHROME_PORT env vars). Use for: filling forms, scraping dynamic pages, web automation, capturing screenshots of live pages.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["navigate", "click", "type", "screenshot", "get_text", "evaluate", "scroll"],
          description: "Browser action to perform.",
        },
        url: {
          type: "string",
          description: "URL to navigate to (required for 'navigate' action).",
        },
        x: {
          type: "number",
          description: "X coordinate for 'click' action.",
        },
        y: {
          type: "number",
          description: "Y coordinate for 'click' action.",
        },
        text: {
          type: "string",
          description: "Text to type (required for 'type' action).",
        },
        expression: {
          type: "string",
          description: "JavaScript expression to evaluate (required for 'evaluate' action).",
        },
        deltaY: {
          type: "number",
          description: "Pixels to scroll vertically (for 'scroll' action, positive = down).",
        },
      },
      required: ["action"],
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
  "memory_search",
  "memory_save",
  "memory_forget",
  "memory_forget_all",
  "memory_get",
  "cron",
  "session_status",
  "browser",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

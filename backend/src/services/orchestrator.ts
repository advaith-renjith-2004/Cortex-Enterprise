import { nvidiaClient, NVIDIA_CONFIG, isNvidiaMock } from '../config/nvidia';
import { supabase, isSupabaseMock } from '../config/supabase';
import OpenAI from 'openai';

export interface SearchResult {
  routedDepartment: string;
  toolUsed: string;
  arguments: any;
  results: any[];
  summary: string;
  needsClarification: boolean;
  clarificationMessage?: string;
}

/**
 * Generates a 1024-dimensional embedding vector for query text.
 * Connects to NeMo Retriever Embedding NIM.
 * If running in mock mode, returns a deterministic unit-length random vector.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const dimension = NVIDIA_CONFIG.embeddingDimension;

  if (isNvidiaMock) {
    console.log('[Cortex SDK] Generating mock embedding vector (1024d) for text:', text.substring(0, 30));
    // Generate simple deterministic vector based on string characters
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const rawVec = Array.from({ length: dimension }, (_, idx) => {
      const seed = Math.sin(hash + idx) * 10000;
      return seed - Math.floor(seed);
    });
    const norm = Math.sqrt(rawVec.reduce((sum, val) => sum + val * val, 0));
    return rawVec.map((val) => val / norm);
  }

  try {
    const response = await nvidiaClient.embeddings.create({
      model: NVIDIA_CONFIG.embeddingModel,
      input: [text],
    });
    return response.data[0].embedding;
  } catch (err: any) {
    console.error('[Cortex SDK] Error calling NVIDIA Embedding NIM:', err?.message || err);
    // Fallback to random vector to prevent crash
    const rawVec = Array.from({ length: dimension }, () => Math.random() * 2 - 1);
    const norm = Math.sqrt(rawVec.reduce((sum, val) => sum + val * val, 0));
    return rawVec.map((val) => val / norm);
  }
}

// Define available tools/functions for Meta Llama 3.3 70B
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'queryUnstructuredQALogs',
      description: 'Query QA reports, circuit logs, mechanical framework stress tests, and engineering testing data via semantic search.',
      parameters: {
        type: 'object',
        properties: {
          semanticQuery: {
            type: 'string',
            description: 'The physical concept, part number, failure state, or testing scenario to search for.',
          },
          limit: {
            type: 'number',
            description: 'Number of logs to retrieve.',
            default: 5,
          },
        },
        required: ['semanticQuery'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAccountingLedger',
      description: 'Retrieve financial transactional ledgers, debit/credit records, expenditures, and numeric accounting metrics.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Specific category of transaction (e.g. Travel, Office Supplies, Infrastructure).',
          },
          transactionType: {
            type: 'string',
            enum: ['DEBIT', 'CREDIT'],
            description: 'Filter transaction type.',
          },
          limit: {
            type: 'number',
            description: 'Maximum records to return.',
            default: 10,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getEmployeeDirectory',
      description: 'Search for active employees, roles, departments, or email contact details.',
      parameters: {
        type: 'object',
        properties: {
          nameQuery: {
            type: 'string',
            description: 'Search string for employee name.',
          },
          department: {
            type: 'string',
            enum: ['HR', 'Accounting', 'Marketing', 'Production', 'QA', 'Administration'],
            description: 'Filter employees by company department.',
          },
        },
      },
    },
  },
];

/**
 * Main service to process incoming voice/text queries, determine intent using
 * Meta Llama 3.3 tool calling, run database fetches, and synthesize summaries.
 */
export async function processCortexQuery(userPrompt: string): Promise<SearchResult> {
  const trimmed = userPrompt.trim();

  // If query is too short or empty
  if (!trimmed) {
    return {
      routedDepartment: 'None',
      toolUsed: 'None',
      arguments: {},
      results: [],
      summary: 'Prompt is empty.',
      needsClarification: true,
      clarificationMessage: 'Please provide a search prompt.',
    };
  }

  // System instructions for strict routing and anti-hallucination
  const systemPrompt = `You are the central query router for Cortex Enterprise ERP.
Your task is to review the user's search request and invoke the single most appropriate tool.
If the query is ambiguous, missing key parameters, or doesn't map to a specific department tool, DO NOT call any tool. Instead, respond directly in text explaining what you need clarified to perform the search.
Do not invent database query arguments; only extract them from the user prompt.`;

  // Local Mock Routing for local-compute environment testing without active NIM
  if (isNvidiaMock) {
    return runMockOrchestration(userPrompt);
  }

  try {
    const chatCompletion = await nvidiaClient.chat.completions.create({
      model: NVIDIA_CONFIG.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: trimmed },
      ],
      tools: TOOLS,
      tool_choice: 'auto',
    });

    const responseMsg = chatCompletion.choices[0].message;

    // 1. Check if LLM requested clarification instead of tool call
    if (!responseMsg.tool_calls || responseMsg.tool_calls.length === 0) {
      return {
        routedDepartment: 'General AI Orchestrator',
        toolUsed: 'None',
        arguments: {},
        results: [],
        summary: responseMsg.content || 'I could not determine the appropriate department tool. Please clarify your query.',
        needsClarification: true,
        clarificationMessage: responseMsg.content || 'Please clarify your query with more specific details.',
      };
    }

    // 2. Extract Tool Call Details
    const toolCall = responseMsg.tool_calls[0];
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);

    let dbResults: any[] = [];
    let routedDepartment = '';

    // 3. Execute queries against Supabase
    if (toolName === 'queryUnstructuredQALogs') {
      routedDepartment = 'Production & QA (Semantic Search)';
      const semanticQuery = toolArgs.semanticQuery;
      const limit = toolArgs.limit || 5;

      // Generate embedding vector using NeMo Retriever
      const queryVector = await getEmbedding(semanticQuery);

      if (isSupabaseMock) {
        dbResults = getMockVectorResults(semanticQuery);
      } else {
        const { data, error } = await supabase.rpc('match_logs', {
          query_embedding: queryVector,
          match_threshold: 0.1,
          match_count: limit,
        });

        if (error) {
          throw new Error(`Supabase RPC vector query failed: ${error.message}`);
        }
        dbResults = data || [];
      }
    } else if (toolName === 'getAccountingLedger') {
      routedDepartment = 'Accounting & CA';
      const { category, transactionType, limit = 10 } = toolArgs;

      if (isSupabaseMock) {
        dbResults = getMockLedgerResults(category, transactionType);
      } else {
        let query = supabase.from('ledgers').select('*');
        if (category) {
          query = query.ilike('category', `%${category}%`);
        }
        if (transactionType) {
          query = query.eq('type', transactionType.toUpperCase());
        }
        const { data, error } = await query
          .order('transaction_date', { ascending: false })
          .limit(limit);

        if (error) {
          throw new Error(`Supabase query on ledgers failed: ${error.message}`);
        }
        dbResults = data || [];
      }
    } else if (toolName === 'getEmployeeDirectory') {
      routedDepartment = 'HR & Admin';
      const { nameQuery, department } = toolArgs;

      if (isSupabaseMock) {
        dbResults = getMockEmployeeResults(nameQuery, department);
      } else {
        let query = supabase.from('employees').select('*');
        if (nameQuery) {
          query = query.or(`first_name.ilike.%${nameQuery}%,last_name.ilike.%${nameQuery}%`);
        }
        if (department) {
          query = query.eq('department', department);
        }
        const { data, error } = await query.order('last_name', { ascending: true });

        if (error) {
          throw new Error(`Supabase query on employees failed: ${error.message}`);
        }
        dbResults = data || [];
      }
    } else {
      throw new Error(`Resolved tool '${toolName}' is not matched in orchestration service.`);
    }

    // 4. Synthesize results back into a clean markdown summary
    const synthesisPrompt = `You are a professional enterprise auditor and data analyst for Cortex Enterprise.
Take the following database search details and summarize them.
User query: "${trimmed}"
Routed Department: ${routedDepartment}
Tool used: ${toolName}
Database Results: ${JSON.stringify(dbResults)}

Write a clean, synthesized markdown report summarizing the findings. Focus on being concise, highlighting key numerical calculations, dates, or engineering compliance metrics, and avoid any fabrications. If no results were returned, state that clearly.`;

    const synthesisCompletion = await nvidiaClient.chat.completions.create({
      model: NVIDIA_CONFIG.llmModel,
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    const summaryContent = synthesisCompletion.choices[0].message.content || 'Failed to synthesize summary.';

    return {
      routedDepartment,
      toolUsed: toolName,
      arguments: toolArgs,
      results: dbResults,
      summary: summaryContent,
      needsClarification: false,
    };
  } catch (err: any) {
    console.error('[Cortex Orchestration Error]:', err?.message || err);
    return {
      routedDepartment: 'Error Handler',
      toolUsed: 'None',
      arguments: {},
      results: [],
      summary: `Failed to execute search: ${err?.message || err}`,
      needsClarification: false,
    };
  }
}

// ============================================================================
// SIMULATION & MOCK FALLBACKS (For fast local execution and validation)
// ============================================================================

function runMockOrchestration(userPrompt: string): SearchResult {
  const queryLower = userPrompt.toLowerCase();

  // Route QA vector logs
  if (queryLower.includes('test') || queryLower.includes('circuit') || queryLower.includes('qa') || queryLower.includes('chassis')) {
    const results = getMockVectorResults(userPrompt);
    return {
      routedDepartment: 'Production & QA (Semantic Search - Mocked)',
      toolUsed: 'queryUnstructuredQALogs',
      arguments: { semanticQuery: userPrompt, limit: 3 },
      results,
      summary: `### Cortex Production & QA Report (Mocked)
Found ${results.length} testing log entries matching your mechanical/circuit inquiry:
- **${results[0].component_id}** tested by **${results[0].testing_engineer}**: ${results[0].content} (Result: **${results[0].test_result}**).
- **${results[1].component_id}** tested by **${results[1].testing_engineer}**: ${results[1].content} (Result: **${results[1].test_result}**).`,
      needsClarification: false,
    };
  }

  // Route Ledger/Finance
  if (queryLower.includes('ledger') || queryLower.includes('expense') || queryLower.includes('spend') || queryLower.includes('money')) {
    const category = queryLower.includes('office') ? 'Office Supplies' : undefined;
    const results = getMockLedgerResults(category);
    return {
      routedDepartment: 'Accounting & CA (Mocked)',
      toolUsed: 'getAccountingLedger',
      arguments: { category, limit: 5 },
      results,
      summary: `### Cortex Financial Ledger Summary (Mocked)
Retrieved transactions matching query:
- Total Debit Operations found: ${results.filter((r) => r.type === 'DEBIT').length} transactions.
- Key Transaction: **${results[0].account_name}** under category **${results[0].category}** of **$${results[0].amount}** on **${results[0].transaction_date}**.`,
      needsClarification: false,
    };
  }

  // Route HR
  if (queryLower.includes('employee') || queryLower.includes('who') || queryLower.includes('directory') || queryLower.includes('staff')) {
    const name = queryLower.includes('alice') ? 'Alice' : undefined;
    const results = getMockEmployeeResults(name);
    return {
      routedDepartment: 'HR & Admin (Mocked)',
      toolUsed: 'getEmployeeDirectory',
      arguments: { nameQuery: name },
      results,
      summary: `### Cortex HR Directory Result (Mocked)
Matching staff profiles found:
- **${results[0].first_name} ${results[0].last_name}** (${results[0].role} in **${results[0].department}**) - Contact: ${results[0].email}.`,
      needsClarification: false,
    };
  }

  // Ambiguity check
  return {
    routedDepartment: 'General AI Orchestrator (Mocked)',
    toolUsed: 'None',
    arguments: {},
    results: [],
    summary: 'The prompt did not specifically match HR, QA Testing, or Financial Ledger keywords. Could you please clarify if you want employee details, transactions, or hardware test logs?',
    needsClarification: true,
    clarificationMessage: 'Could you please clarify if you want employee details, transactions, or hardware test logs?',
  };
}

function getMockVectorResults(query: string) {
  return [
    {
      log_id: 1,
      component_id: 'TITAN-CHASSIS-009',
      testing_engineer: 'Alice Vance',
      content: `Thermal stress chamber test started at 50C. Temperature ramped to 85C over 2 hours. Slight metal expansion observed but structural boundaries remained intact. Structural compliance passed. Query context: ${query}`,
      test_result: 'PASS',
      similarity: 0.82,
    },
    {
      log_id: 2,
      component_id: 'PCB-BOARD-A4',
      testing_engineer: 'Alice Vance',
      content: `Circuit continuity check failed on the secondary layer. High resistance noted on trace pin 14. Potential copper bridging causing short circuit under voltage load. Query context: ${query}`,
      test_result: 'FAIL',
      similarity: 0.74,
    },
  ];
}

function getMockLedgerResults(category?: string, type?: string) {
  return [
    {
      ledger_id: 101,
      transaction_date: '2026-06-17',
      account_name: 'Office Supplies Depot',
      description: 'Ergonomic chairs for developers',
      amount: 750.00,
      type: type || 'DEBIT',
      category: category || 'Office Supplies',
    },
    {
      ledger_id: 102,
      transaction_date: '2026-06-16',
      account_name: 'CloudHosting Corp',
      description: 'Production server hosting fee',
      amount: 2400.00,
      type: type || 'DEBIT',
      category: category || 'Infrastructure',
    },
  ];
}

function getMockEmployeeResults(name?: string, department?: string) {
  return [
    {
      employee_id: 1,
      first_name: name || 'Alice',
      last_name: 'Vance',
      email: 'alice.vance@cortex-enterprise.io',
      phone: '555-0192',
      department: department || 'QA',
      role: 'Lead Test Engineer',
      is_active: true,
    },
  ];
}

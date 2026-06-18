import json
import logging
import random
from typing import List, Dict, Any, Optional
from openai import OpenAI
from app.config import settings
from app import db

logger = logging.getLogger("nervecore.llm")

# Initialize the OpenAI compatible client pointing to NVIDIA NIM
client = OpenAI(
    api_key=settings.NVIDIA_API_KEY,
    base_url=settings.NVIDIA_NIM_BASE_URL
)

def get_embedding(text: str) -> List[float]:
    """
    Generates a 1024-dimensional embedding vector for the query text.
    Uses the NVIDIA Embedding NIM. Falls back to a unit-length random vector 
    if the NIM is unavailable or the API key is not configured.
    """
    if not settings.NVIDIA_API_KEY or settings.NVIDIA_API_KEY == "mock-key-for-local-development":
        logger.warning("Mock API key detected. Generating a simulated 1024-dimensional embedding.")
        # Generate a deterministic mock embedding based on hash of text (for basic reproducibility)
        random.seed(hash(text))
        raw_vec = [random.uniform(-1, 1) for _ in range(settings.EMBEDDING_DIMENSION)]
        norm = sum(x**2 for x in raw_vec)**0.5
        return [x / norm for x in raw_vec]

    try:
        response = client.embeddings.create(
            input=[text],
            model=settings.NVIDIA_EMBEDDING_MODEL
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"Error generating embedding via NVIDIA NIM: {e}")
        # Fallback to random unit vector
        random.seed(hash(text))
        raw_vec = [random.uniform(-1, 1) for _ in range(settings.EMBEDDING_DIMENSION)]
        norm = sum(x**2 for x in raw_vec)**0.5
        return [x / norm for x in raw_vec]

# ============================================================================
# LLM TOOL DEFINITIONS FOR META LLAMA 3.3 70B
# ============================================================================

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_employees",
            "description": "Query employee profiles, HR contact info, and roles from the HR department.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name_query": {"type": "string", "description": "Part of the employee first or last name to filter by."},
                    "department": {
                        "type": "string", 
                        "enum": ["HR", "Accounting", "Marketing", "Production", "QA", "Administration"],
                        "description": "Filter results by specific company department."
                    },
                    "active_only": {"type": "boolean", "default": True, "description": "True to query only active staff."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_attendance",
            "description": "Retrieve daily check-in, check-out, and status records for an employee.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "integer", "description": "The unique numerical identifier of the employee."},
                    "start_date": {"type": "string", "description": "Retrieve records starting on this date (YYYY-MM-DD)."},
                    "end_date": {"type": "string", "description": "Retrieve records up to this date (YYYY-MM-DD)."}
                },
                "required": ["employee_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_finance_ledger",
            "description": "Retrieve accounting ledger transactions, including debits, credits, and operational expenses.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "The category of expenditure, like 'Travel' or 'Office Supplies'."},
                    "transaction_type": {"type": "string", "enum": ["DEBIT", "CREDIT"], "description": "Type of account transaction."},
                    "start_date": {"type": "string", "description": "Start date for ledger entries (YYYY-MM-DD)."},
                    "end_date": {"type": "string", "description": "End date for ledger entries (YYYY-MM-DD)."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_purchases",
            "description": "Query corporate purchasing logs, supplier data, and item expenditures.",
            "parameters": {
                "type": "object",
                "properties": {
                    "supplier_name": {"type": "string", "description": "The name of the vendor/supplier to search for."},
                    "department": {"type": "string", "description": "Purchasing department to filter by."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_marketing_campaigns",
            "description": "Retrieve marketing campaign budgets, states, timelines, and advertising details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["Planning", "Active", "Paused", "Completed"], "description": "Status of the marketing campaign."},
                    "campaign_name": {"type": "string", "description": "Filter by marketing campaign name."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_technical_qa_logs",
            "description": "Perform high-performance semantic search on unstructured technical testing logs (e.g. circuit failures, mechanical framework specifications, QA tests).",
            "parameters": {
                "type": "object",
                "properties": {
                    "semantic_query": {"type": "string", "description": "The text concepts to search for (e.g., 'circuit overheating', 'tensile strength stress tests')."},
                    "limit": {"type": "integer", "default": 5, "description": "Number of logs to return."},
                    "min_similarity": {"type": "number", "default": 0.4, "description": "Minimum similarity score between 0.0 and 1.0."}
                },
                "required": ["semantic_query"]
            }
        }
    }
]

# Map string tool names to physical Python functions in app.db
TOOL_MAP = {
    "query_employees": db.query_employee_records,
    "get_employee_attendance": db.query_attendance_by_employee,
    "query_finance_ledger": db.query_ledger_records,
    "query_purchases": db.query_purchasing_logs,
    "query_marketing_campaigns": db.query_marketing_campaigns
}

def execute_routing_and_search(user_query: str) -> Dict[str, Any]:
    """
    Orchestrates the search request:
    1. Sends query to Meta Llama 3.3 70B with tools to identify department/tool intent.
    2. Executes the resolved tool query safely against PostgreSQL (with pgvector for semantic search).
    3. Handles mock mode fallback gracefully when API keys aren't set.
    """
    logger.info(f"Routing query: '{user_query}'")

    system_prompt = (
        "You are the central query routing core for NerveCore ERP. "
        "Analyze the user's question, determine which department it relates to, "
        "and select the single most appropriate tool. "
        "Do not make up parameters or try to write raw SQL code. "
        "If a question cannot be resolved using the provided tools, "
        "explain what departments you support and ask for clarification."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_query}
    ]

    # Handle local mock routing to allow testing without an active LLM NIM connection
    if not settings.NVIDIA_API_KEY or settings.NVIDIA_API_KEY == "mock-key-for-local-development":
        logger.warning("Mock LLM routing triggered.")
        return _mock_llm_routing(user_query)

    try:
        response = client.chat.completions.create(
            model=settings.NVIDIA_LLM_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"
        )
        
        response_message = response.choices[0].message
        
        # Check if model wants to call a tool
        if response_message.tool_calls:
            tool_call = response_message.tool_calls[0]
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            
            logger.info(f"LLM routed query to tool '{function_name}' with args {function_args}")
            
            # Special case for Vector search (requires embedding generation)
            if function_name == "search_technical_qa_logs":
                semantic_query = function_args.get("semantic_query")
                limit = function_args.get("limit", 5)
                min_sim = function_args.get("min_similarity", 0.4)
                
                query_vector = get_embedding(semantic_query)
                results = db.semantic_search_testing_logs(
                    query_embedding=query_vector,
                    limit=limit,
                    min_similarity=min_sim
                )
                return {
                    "routed_department": "Production & QA (Semantic Vector Search)",
                    "tool_used": function_name,
                    "arguments": function_args,
                    "results": results
                }
            
            # General case for relational SQL queries
            if function_name in TOOL_MAP:
                db_func = TOOL_MAP[function_name]
                results = db_func(**function_args)
                
                department_mapping = {
                    "query_employees": "HR & Admin",
                    "get_employee_attendance": "HR & Admin",
                    "query_finance_ledger": "Accounting & CA",
                    "query_purchases": "Accounting & CA",
                    "query_marketing_campaigns": "Marketing"
                }
                
                return {
                    "routed_department": department_mapping.get(function_name, "Relational Core"),
                    "tool_used": function_name,
                    "arguments": function_args,
                    "results": results
                }
                
            return {
                "error": f"Tool '{function_name}' was requested but is not implemented in the backend mapping."
            }
            
        else:
            # LLM replied with text instead of a tool call
            return {
                "routed_department": "None",
                "message": response_message.content,
                "results": []
            }
            
    except Exception as e:
        logger.error(f"Error during LLM routing/inference: {e}")
        return {
            "error": "Failed to complete query orchestration",
            "details": str(e)
        }

def _mock_llm_routing(user_query: str) -> Dict[str, Any]:
    """Simulates Llama 3.3 tool routing for fast local-compute validation."""
    query_lower = user_query.lower()
    
    # 1. Simulate Production & QA Vector Search
    if "test" in query_lower or "log" in query_lower or "sensor" in query_lower or "circuit" in query_lower:
        query_vector = get_embedding(user_query)
        results = db.semantic_search_testing_logs(query_vector, limit=3, min_similarity=0.1)
        return {
            "routed_department": "Production & QA (Semantic Vector Search - Mocked)",
            "tool_used": "search_technical_qa_logs",
            "arguments": {"semantic_query": user_query, "limit": 3, "min_similarity": 0.1},
            "results": results
        }
        
    # 2. Simulate Ledger/CA Search
    elif "ledger" in query_lower or "spend" in query_lower or "cost" in query_lower or "office" in query_lower:
        # Category heuristic
        category = "Office Supplies" if "office" in query_lower else None
        results = db.query_ledger_records(category=category, limit=3)
        return {
            "routed_department": "Accounting & CA (Mocked)",
            "tool_used": "query_finance_ledger",
            "arguments": {"category": category, "limit": 3},
            "results": results
        }
        
    # 3. Simulate HR Search
    elif "employee" in query_lower or "staff" in query_lower or "present" in query_lower or "attendance" in query_lower:
        results = db.query_employee_records()
        return {
            "routed_department": "HR & Admin (Mocked)",
            "tool_used": "query_employees",
            "arguments": {"active_only": True},
            "results": results
        }
        
    # 4. Simulate Marketing Search
    elif "campaign" in query_lower or "marketing" in query_lower or "ads" in query_lower:
        results = db.query_marketing_campaigns()
        return {
            "routed_department": "Marketing (Mocked)",
            "tool_used": "query_marketing_campaigns",
            "arguments": {},
            "results": results
        }
        
    # Text response fallback
    return {
        "routed_department": "General AI Assistant (Mocked)",
        "message": f"Hello! The NerveCore system received your query: '{user_query}'. If this were connected to the NVIDIA NIM, Llama 3.3 would route this specifically using structured function parameters.",
        "results": []
    }
